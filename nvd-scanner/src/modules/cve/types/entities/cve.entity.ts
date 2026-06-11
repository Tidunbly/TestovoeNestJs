import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PortSnapshotEntity } from '../../../scan/types/entities/port-snapshot.entity';

@Entity({ name: 'cves' })
export class CveEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  cveId: string;

  @Column({ type: 'float', nullable: true })
  cvssV3: number | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'timestamp' })
  publishedAt: Date;

  @OneToMany(() => PortSnapshotEntity, (snapshot) => snapshot.cve)
  snapshots: PortSnapshotEntity[];
}
