import { Controller, Post } from '@nestjs/common';
import { JobsService } from '@modules/jobs/jobs.service';
import { TargetsService } from '@modules/targets/targets.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly targetsService: TargetsService,
  ) {}

  @Post('run-daily')
  async runDailyNow() {
    const targetIds = await this.targetsService.getEnabledTargetIds();
    return this.jobsService.enqueueDailyJobs(targetIds);
  }
}
