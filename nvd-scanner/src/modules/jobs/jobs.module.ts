import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortScanJobEntity } from './types/entities/port-scan-job.entity';
import { CveSyncJobEntity } from './types/entities/cve-sync-job.entity';
import { PortScanJobRepository } from './repositories/port-scan-job.repository';
import { CveSyncJobRepository } from './repositories/cve-sync-job.repository';
import { JobsService } from './jobs.service';
import { JobsScheduler } from './jobs.scheduler';
import { PortScanWorker } from './workers/port-scan.worker';
import { CveSyncWorker } from './workers/cve-sync.worker';
import { TargetsModule } from '../targets/targets.module';
import { ScanModule } from '../scan/scan.module';
import { CveModule } from '../cve/cve.module';
import { JobsController } from './jobs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortScanJobEntity, CveSyncJobEntity]),
    TargetsModule,
    ScanModule,
    CveModule,
  ],
  providers: [
    PortScanJobRepository,
    CveSyncJobRepository,
    JobsService,
    JobsScheduler,
    PortScanWorker,
    CveSyncWorker,
  ],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
