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
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'inet', unique: true })
  ip: string;

  @Column({ type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PortScanJobEntity, (portScanJob) => portScanJob.target)
  portScanJobs: PortScanJobEntity[];

  @OneToMany(() => PortSnapshotEntity, (snapshot) => snapshot.target)
  snapshots: PortSnapshotEntity[];
}
