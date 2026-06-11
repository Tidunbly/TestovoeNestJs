import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PortSnapshotEntity } from '../../../scan/types/entities/port-snapshot.entity';

@Entity({ name: 'service_versions' })
export class ServiceVersionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  name!: string;

  @OneToMany(() => PortSnapshotEntity, (snapshot) => snapshot.version)
  snapshots!: PortSnapshotEntity[];
}
