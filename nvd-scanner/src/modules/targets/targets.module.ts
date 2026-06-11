import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanTargetEntity } from './types/entities/scan-target.entity';
import { ScanTargetRepository } from './repositories/scan-target.repository';
import { TargetsService } from './targets.service';
import { TargetsController } from './targets.controller';
import { TargetResolverService } from './services/target-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScanTargetEntity])],
  providers: [ScanTargetRepository, TargetsService, TargetResolverService],
  controllers: [TargetsController],
  exports: [TargetsService],
})
export class TargetsModule {}



