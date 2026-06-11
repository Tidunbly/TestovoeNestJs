import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { JobsService } from '@modules/jobs/jobs.service';
import { TargetsService } from '@modules/targets/targets.service';

@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsScheduler.name);
  private readonly cronExpression: string;
  private static readonly CRON_NAME = 'enqueueDailyJobs';

  constructor(
    private readonly jobsService: JobsService,
    private readonly targetsService: TargetsService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.cronExpression = this.configService.get<string>(
      'DAILY_JOBS_CRON',
      '0 20 * * *',
    );
  }

  onModuleInit(): void {
    try {
      const job = new CronJob(this.cronExpression, () => {
        void this.runDailyJobs();
      });
      this.schedulerRegistry.addCronJob(JobsScheduler.CRON_NAME, job);
      job.start();
      this.logger.log(`Daily jobs cron registered: "${this.cronExpression}"`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to register daily jobs cron "${this.cronExpression}": ${message}`,
      );
    }
  }

  onModuleDestroy(): void {
    try {
      this.schedulerRegistry.deleteCronJob(JobsScheduler.CRON_NAME);
    } catch {
      /* not registered */
    }
  }

  private async runDailyJobs(): Promise<void> {
    try {
      const targetIds = await this.targetsService.getEnabledTargetIds();
      const result = await this.jobsService.enqueueDailyJobs(targetIds);
      this.logger.log(
        `Daily jobs enqueued (cron "${this.cronExpression}"): scan=${result.scanJobs}, cve=${result.cveJobs}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Daily jobs cron run failed: ${message}`);
    }
  }
}
