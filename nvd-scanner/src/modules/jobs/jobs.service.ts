import { Injectable } from '@nestjs/common';
import { CveSyncJobRepository } from '@modules/jobs/repositories/cve-sync-job.repository';
import { PortScanJobRepository } from '@modules/jobs/repositories/port-scan-job.repository';

@Injectable()
export class JobsService {
  constructor(
    private readonly portScanJobRepository: PortScanJobRepository,
    private readonly cveSyncJobRepository: CveSyncJobRepository,
  ) {}

  async enqueueDailyJobs(
    targetIds: number[],
  ): Promise<{ scanJobs: number; cveJobs: number }> {
    const scanJobs = this.portScanJobRepository.createManyForTargets(targetIds);
    await this.portScanJobRepository.saveMany(scanJobs);

    const cveJob = this.cveSyncJobRepository.createPendingJob();
    await this.cveSyncJobRepository.save(cveJob);

    return {
      scanJobs: scanJobs.length,
      cveJobs: 1,
    };
  }
}
