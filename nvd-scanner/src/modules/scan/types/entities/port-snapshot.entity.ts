import { CveEntity } from '../../../cve/types/entities/cve.entity';
import { ScanTargetEntity } from '../../../targets/types/entities/scan-target.entity';
import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { PortEntity } from '../../../scan/types/entities/port.entity';
import { ServiceVersionEntity } from '../../../scan/types/entities/service-version.entity';

@Entity({ name: 'port_snapshots' })
export class PortSnapshotEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ipId!: number;

  @Column()
  portId!: number;

  @Column()
  versionId!: number;

  @Column({ nullable: true })
  cveId!: number | null;

  @ManyToOne(() => ScanTargetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ipId' })
  target!: ScanTargetEntity;

  @ManyToOne(() => PortEntity, (port) => port.snapshots, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'portId' })
  port!: PortEntity;

  @ManyToOne(() => ServiceVersionEntity, (version) => version.snapshots, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'versionId' })
  version!: ServiceVersionEntity;

  @ManyToOne(() => CveEntity, (cve) => cve.snapshots, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cveId' })
  cve!: CveEntity | null;

  @CreateDateColumn()
  createdAt!: Date;
}
