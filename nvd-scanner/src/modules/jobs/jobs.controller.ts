import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCreatedResponse } from '@nestjs/swagger';
import { JobsService } from '@modules/jobs/jobs.service';
import { TargetsService } from '@modules/targets/targets.service';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly targetsService: TargetsService,
  ) {}

  @Post('run-daily')
  @ApiOperation({ summary: 'Run daily jobs', description: 'Manually triggers daily scan jobs for all enabled targets and enqueues a CVE sync job' })
  @ApiCreatedResponse({
    description: 'Jobs enqueued successfully',
    schema: {
      example: { scanJobs: 5, cveJobs: 1 },
    },
  })
  async runDailyNow() {
    const targetIds = await this.targetsService.getEnabledTargetIds();
    return this.jobsService.enqueueDailyJobs(targetIds);
  }
}
