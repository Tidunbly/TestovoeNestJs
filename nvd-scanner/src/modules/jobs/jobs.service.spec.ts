import { JobsService } from './jobs.service';
import { PortScanJobRepository } from './repositories/port-scan-job.repository';
import { CveSyncJobRepository } from './repositories/cve-sync-job.repository';

describe('JobsService', () => {
  it('enqueues scan jobs and one cve job', async () => {
    const portScanRepo = {
      createManyForTargets: jest
        .fn()
        .mockReturnValue([{ ipId: 1 }, { ipId: 2 }]),
      saveMany: jest.fn().mockResolvedValue(undefined),
    } as unknown as PortScanJobRepository;
    const cveRepo = {
      createPendingJob: jest.fn().mockReturnValue({ status: 'pending' }),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as CveSyncJobRepository;

    const service = new JobsService(portScanRepo, cveRepo);
    const result = await service.enqueueDailyJobs([1, 2]);

    expect(portScanRepo.createManyForTargets).toHaveBeenCalledWith([1, 2]);
    expect(portScanRepo.saveMany).toHaveBeenCalledTimes(1);
    expect(cveRepo.createPendingJob).toHaveBeenCalledTimes(1);
    expect(cveRepo.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanJobs: 2, cveJobs: 1 });
  });
});
