jest.mock('@nestjs/schedule', () => ({
  Interval: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PortScanWorker } from './port-scan.worker';
import { PortScanJobRepository } from '../repositories/port-scan-job.repository';
import { TargetsService } from '../../targets/targets.service';
import { ScanService } from '../../scan/scan.service';
import { ConfigService } from '@nestjs/config';

const mockPortScanJobRepository = {
  takePendingJob: jest.fn(),
  findById: jest.fn(),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
};

const mockTargetsService = {
  getTargetById: jest.fn(),
};

const mockScanService = {
  scanIp: jest.fn(),
};

function createConfig(overrides: Record<string, any> = {}) {
  return {
    get: jest.fn().mockImplementation((key: string, def: any) => {
      const map: Record<string, any> = {
        SCAN_WORKER_CONCURRENCY: 2,
        SCAN_JOB_RETRY_ATTEMPTS: 1,
        SCAN_JOB_RETRY_DELAY_MS: 0,
        SCAN_WORKER_POLL_MS: 0,
        ...overrides,
      };
      return map[key] ?? def;
    }),
  };
}

function createWorker(configOverrides: Record<string, any> = {}) {
  return Test.createTestingModule({
    providers: [
      PortScanWorker,
      { provide: PortScanJobRepository, useValue: mockPortScanJobRepository },
      { provide: TargetsService, useValue: mockTargetsService },
      { provide: ScanService, useValue: mockScanService },
      { provide: ConfigService, useValue: createConfig(configOverrides) },
    ],
  }).compile().then((m) => m.get<PortScanWorker>(PortScanWorker));
}

describe('PortScanWorker', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('tick() rate-limiting', () => {
    it('should skip if polled too recently', async () => {
      jest.useFakeTimers();
      jest.spyOn(Date, 'now').mockReturnValue(0);
      const worker = await createWorker({ SCAN_WORKER_POLL_MS: 3000 });

      await worker.tick();

      (Date.now as jest.Mock).mockReturnValue(1000);
      await worker.tick();

      expect(mockPortScanJobRepository.takePendingJob).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should proceed when enough time has passed', async () => {
      jest.useFakeTimers();
      jest.spyOn(Date, 'now').mockReturnValue(0);
      const worker = await createWorker({ SCAN_WORKER_POLL_MS: 3000 });

      await worker.tick();

      (Date.now as jest.Mock).mockReturnValue(5000);
      mockPortScanJobRepository.takePendingJob.mockResolvedValue(null);
      await worker.tick();

      expect(mockPortScanJobRepository.takePendingJob).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe('tick() concurrency', () => {
    it('should call takePendingJob and stop when no jobs', async () => {
      mockPortScanJobRepository.takePendingJob.mockResolvedValue(null);
      const worker = await createWorker();

      await worker.tick();

      expect(mockPortScanJobRepository.takePendingJob).toHaveBeenCalledTimes(1);
    });

    it('should claim jobs up to maxConcurrent', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 1, ipId: 10 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue({ id: 1, ipId: 10 });
      mockTargetsService.getTargetById.mockResolvedValue({ id: 10, ip: '1.2.3.4' });
      mockScanService.scanIp.mockResolvedValue(1);
      const worker = await createWorker({ SCAN_WORKER_CONCURRENCY: 2 });

      await worker.tick();

      expect(mockPortScanJobRepository.takePendingJob).toHaveBeenCalledTimes(2);
    });

    it('should stop claiming when concurrency limit reached', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 1, ipId: 10 })
        .mockResolvedValueOnce({ id: 2, ipId: 20 })
        .mockResolvedValue(null);
      mockPortScanJobRepository.findById
        .mockResolvedValueOnce({ id: 1, ipId: 10 })
        .mockResolvedValueOnce({ id: 2, ipId: 20 });
      mockTargetsService.getTargetById
        .mockResolvedValueOnce({ id: 10, ip: '1.1.1.1' })
        .mockResolvedValueOnce({ id: 20, ip: '2.2.2.2' });
      mockScanService.scanIp.mockResolvedValue(1);
      const worker = await createWorker({ SCAN_WORKER_CONCURRENCY: 2 });

      await worker.tick();

      expect(mockPortScanJobRepository.takePendingJob).toHaveBeenCalledTimes(2);
      expect(mockPortScanJobRepository.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('processJob()', () => {
    it('should mark job as completed on success', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 5, ipId: 10 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue({ id: 5, ipId: 10 });
      mockTargetsService.getTargetById.mockResolvedValue({ id: 10, ip: '10.0.0.1' });
      mockScanService.scanIp.mockResolvedValue(4);
      const worker = await createWorker();

      await worker.tick();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPortScanJobRepository.markCompleted).toHaveBeenCalledWith(5);
      expect(mockPortScanJobRepository.markFailed).not.toHaveBeenCalled();
    });

    it('should mark job as failed when scanService throws', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 7, ipId: 20 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue({ id: 7, ipId: 20 });
      mockTargetsService.getTargetById.mockResolvedValue({ id: 20, ip: '3.3.3.3' });
      mockScanService.scanIp.mockRejectedValue(new Error('nmap timeout'));
      const worker = await createWorker();

      await worker.tick();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPortScanJobRepository.markFailed).toHaveBeenCalledWith(
        7,
        'nmap timeout',
      );
    });

    it('should mark job as failed when job not found', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 99, ipId: 30 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue(null);
      const worker = await createWorker();

      await worker.tick();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPortScanJobRepository.markFailed).toHaveBeenCalledWith(
        99,
        'Scan job not found',
      );
    });

    it('should mark job as failed when target not found', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 10, ipId: 40 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue({ id: 10, ipId: 40 });
      mockTargetsService.getTargetById.mockResolvedValue(null);
      const worker = await createWorker();

      await worker.tick();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPortScanJobRepository.markFailed).toHaveBeenCalledWith(
        10,
        'Target not found for ipId=40',
      );
    });
  });

  describe('withRetry()', () => {
    it('should retry on failure and succeed on second attempt', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 20, ipId: 50 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue({ id: 20, ipId: 50 });
      mockTargetsService.getTargetById.mockResolvedValue({ id: 50, ip: '5.5.5.5' });
      mockScanService.scanIp
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce(1);
      const worker = await createWorker();

      await worker.tick();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockScanService.scanIp).toHaveBeenCalledTimes(2);
      expect(mockPortScanJobRepository.markCompleted).toHaveBeenCalledWith(20);
    });

    it('should exhaust retries and fail', async () => {
      mockPortScanJobRepository.takePendingJob
        .mockResolvedValueOnce({ id: 30, ipId: 60 })
        .mockResolvedValueOnce(null);
      mockPortScanJobRepository.findById.mockResolvedValue({ id: 30, ipId: 60 });
      mockTargetsService.getTargetById.mockResolvedValue({ id: 60, ip: '6.6.6.6' });
      mockScanService.scanIp.mockRejectedValue(new Error('persistent failure'));
      const worker = await createWorker();

      await worker.tick();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockScanService.scanIp).toHaveBeenCalledTimes(2);
      expect(mockPortScanJobRepository.markFailed).toHaveBeenCalledWith(
        30,
        'persistent failure',
      );
    });
  });
});
