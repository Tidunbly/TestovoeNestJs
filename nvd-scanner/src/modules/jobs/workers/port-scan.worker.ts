import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PortScanJobRepository } from '@modules/jobs/repositories/port-scan-job.repository';
import { ScanService } from '@modules/scan/scan.service';
import { TargetsService } from '@modules/targets/targets.service';

@Injectable()
export class PortScanWorker {
  private readonly logger = new Logger(PortScanWorker.name);
  private readonly maxConcurrent: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly pollIntervalMs: number;
  private activeCount = 0;
  private lastPollAt = 0;

  constructor(
    private readonly portScanJobRepository: PortScanJobRepository,
    private readonly targetsService: TargetsService,
    private readonly scanService: ScanService,
    private readonly configService: ConfigService,
  ) {
    this.maxConcurrent = this.getNumberEnv('SCAN_WORKER_CONCURRENCY', 3);
    this.retryAttempts = this.getNumberEnv('SCAN_JOB_RETRY_ATTEMPTS', 2);
    this.retryDelayMs = this.getNumberEnv('SCAN_JOB_RETRY_DELAY_MS', 1200);
    this.pollIntervalMs = this.getNumberEnv('SCAN_WORKER_POLL_MS', 3000);
  }

  @Interval(1000)
  async tick(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPollAt < this.pollIntervalMs) {
      return;
    }
    this.lastPollAt = now;

    while (this.activeCount < this.maxConcurrent) {
      const job = await this.portScanJobRepository.takePendingJob();
      if (!job) {
        return;
      }

      this.activeCount += 1;
      this.processJob(job.id).finally(() => {
        this.activeCount -= 1;
      });
    }
  }

  private async processJob(jobId: number): Promise<void> {
    try {
      const job = await this.portScanJobRepository.findById(jobId);
      if (!job) {
        throw new Error('Scan job not found');
      }

      const target = await this.targetsService.getTargetById(job.ipId);
      if (!target) {
        throw new Error(`Target not found for ipId=${job.ipId}`);
      }

      const snapshotsCount = await this.withRetry(() =>
        this.scanService.scanIp(target.ip, target.id),
      );
      this.logger.log(
        `Port scan job ${jobId} completed with ${snapshotsCount} snapshots`,
      );
      await this.portScanJobRepository.markCompleted(jobId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown port scan worker error';
      this.logger.error(`Port scan job ${jobId} failed: ${message}`);
      await this.portScanJobRepository.markFailed(jobId, message);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retryAttempts + 1; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt <= this.retryAttempts) {
          await this.sleep(this.retryDelayMs);
        }
      }
    }

    throw lastError;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getNumberEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
