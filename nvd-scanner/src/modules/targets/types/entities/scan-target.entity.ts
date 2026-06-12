import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PortScanJobEntity } from '../../../jobs/types/entities/port-scan-job.entity';
import { PortSnapshotEntity } from '../../../scan/types/entities/port-snapshot.entity';

@Entity({ name: 'scan_targets' })
export class ScanTargetEntity {
  @ApiProperty({ example: 1, description: 'Unique identifier' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: '192.168.1.1', description: 'Target IP address' })
  @Column({ type: 'inet', unique: true })
  ip: string;

  @ApiProperty({ example: true, description: 'Whether the target is enabled for scanning' })
  @Column({ type: 'boolean', default: true })
  isEnabled: boolean;

  @ApiProperty({ example: '2026-05-10T15:16:21.546Z', description: 'Creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2026-05-10T15:16:21.546Z', description: 'Last update timestamp' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiHideProperty()
  @OneToMany(() => PortScanJobEntity, (portScanJob) => portScanJob.target)
  portScanJobs: PortScanJobEntity[];

  @ApiHideProperty()
  @OneToMany(() => PortSnapshotEntity, (snapshot) => snapshot.target)
  snapshots: PortSnapshotEntity[];
}
