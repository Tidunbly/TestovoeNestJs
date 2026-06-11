import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PortScanJobEntity } from '../types/entities/port-scan-job.entity';
import { JobStatus } from '../types/job-status.enum';
import { Repository } from 'typeorm';

@Injectable()
export class PortScanJobRepository {
  constructor(
    @InjectRepository(PortScanJobEntity)
    private readonly repository: Repository<PortScanJobEntity>,
  ) {}

  createManyForTargets(targetIds: number[]): PortScanJobEntity[] {
    return targetIds.map((ipId) =>
      this.repository.create({
        ipId,
        status: JobStatus.PENDING,
      }),
    );
  }

  async saveMany(jobs: PortScanJobEntity[]): Promise<void> {
    if (!jobs.length) {
      return;
    }

    await this.repository.insert(jobs);
  }

  async takePendingJob(): Promise<PortScanJobEntity | null> {
    const pending = await this.repository.findOne({
      where: { status: JobStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    if (!pending) {
      return null;
    }

    const updateResult = await this.repository.update(
      {
        id: pending.id,
        status: JobStatus.PENDING,
      },
      {
        status: JobStatus.ACTIVE,
        startedAt: new Date(),
        errorMessage: null,
      },
    );

    if (!updateResult.affected) {
      return null;
    }

    return this.repository.findOne({ where: { id: pending.id } });
  }

  async findById(id: number): Promise<PortScanJobEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async markCompleted(id: number): Promise<void> {
    await this.repository.update(
      { id },
      {
        status: JobStatus.COMPLETED,
        finishedAt: new Date(),
      },
    );
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    await this.repository.update(
      { id },
      {
        status: JobStatus.ERROR,
        finishedAt: new Date(),
        errorMessage,
      },
    );
  }
}
