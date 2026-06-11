import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CveEntity } from '@modules/cve/types/entities/cve.entity';
import { CveRepository } from '@modules/cve/repositories/cve.repository';
import { CveService } from '@modules/cve/cve.service';

@Module({
  imports: [TypeOrmModule.forFeature([CveEntity])],
  providers: [CveRepository, CveService],
  exports: [CveService],
})
export class CveModule {}
