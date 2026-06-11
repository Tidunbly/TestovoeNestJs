import { Test, TestingModule } from '@nestjs/testing';
import { ScanService } from './scan.service';
import { ScanRepository } from './repositories/scan.repository';
import { CveService } from '../cve/cve.service';
import { TargetsService } from '../targets/targets.service';
import { ConfigService } from '@nestjs/config';

// Mock execFile to avoid real nmap call
jest.mock('node:child_process', () => ({
  execFile: jest.fn((_cmd, _args, _opts, callback) => {
    // Simulate successful nmap output with two open ports
    const stdout = `Host: 1.2.3.4 (example.com)\tPorts: 80/open/tcp//http//Apache httpd 2.4.41/, 443/open/tcp//ssl//OpenSSL 1.1.1/\n`;
    callback(null, { stdout, stderr: '' });
  }),
}));

const mockScanRepository = {
  getOrCreatePort: jest.fn().mockImplementation((port: number) =>
    Promise.resolve({ id: port, port } as any),
  ),
  getOrCreateVersion: jest.fn().mockImplementation((name: string) =>
    Promise.resolve({ id: 1, name } as any),
  ),
  saveSnapshots: jest.fn().mockResolvedValue(undefined),
};

const mockCveService = {
  findBestCandidateForVersion: jest.fn().mockResolvedValue(null),
};

const mockTargetsService = {
  getTargetsByIps: jest.fn().mockResolvedValue([]),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, def: any) => {
    const map: Record<string, any> = {
      NMAP_TIMEOUT_MS: 5000,
    };
    return map[key] ?? def;
  }),
} as any;

describe('ScanService', () => {
  let service: ScanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanService,
        { provide: ScanRepository, useValue: mockScanRepository },
        { provide: CveService, useValue: mockCveService },
        { provide: TargetsService, useValue: mockTargetsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ScanService>(ScanService);
    jest.clearAllMocks();
  });

  it('should parse nmap output and create snapshots', async () => {
    const count = await service.scanIp('1.2.3.4', 123);
    expect(count).toBe(2);
    // Two ports should have been processed
    expect(mockScanRepository.getOrCreatePort).toHaveBeenCalledTimes(2);
    expect(mockScanRepository.getOrCreateVersion).toHaveBeenCalledTimes(2);
    expect(mockCveService.findBestCandidateForVersion).toHaveBeenCalledTimes(2);
    expect(mockScanRepository.saveSnapshots).toHaveBeenCalledWith(123, expect.any(Array));
    const savedRows = (mockScanRepository.saveSnapshots as jest.Mock).mock.calls[0][1];
    expect(savedRows).toHaveLength(2);
    expect(savedRows[0]).toMatchObject({ portId: 80, versionId: 1, cveId: null });
    expect(savedRows[1]).toMatchObject({ portId: 443, versionId: 1, cveId: null });
  });
});
