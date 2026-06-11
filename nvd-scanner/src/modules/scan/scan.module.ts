import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortEntity } from '@modules/scan/types/entities/port.entity';
import { ServiceVersionEntity } from '@modules/scan/types/entities/service-version.entity';
import { PortSnapshotEntity } from '@modules/scan/types/entities/port-snapshot.entity';
import { ScanRepository } from '@modules/scan/repositories/scan.repository';
import { ScanService } from '@modules/scan/scan.service';
import { CveModule } from '@modules/cve/cve.module';
import { ScanController } from '@modules/scan/scan.controller';
import { TargetsModule } from '@modules/targets/targets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PortEntity, ServiceVersionEntity, PortSnapshotEntity]),
    CveModule,
    TargetsModule,
  ],
  providers: [ScanRepository, ScanService],
  controllers: [ScanController],
  exports: [ScanService],
})
export class ScanModule {}
