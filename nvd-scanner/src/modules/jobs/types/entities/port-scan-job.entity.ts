import { ScanTargetEntity } from '../../../targets/types/entities/scan-target.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobStatus } from '../job-status.enum';

@Entity({ name: 'port_scan_jobs' })
export class PortScanJobEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ipId: number;

  @ManyToOne(() => ScanTargetEntity, (scanTarget) => scanTarget.portScanJobs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ipId' })
  target: ScanTargetEntity;

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  status: JobStatus;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
