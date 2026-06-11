import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PortSnapshotEntity } from '../../../scan/types/entities/port-snapshot.entity';

@Entity({ name: 'ports' })
export class PortEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', unique: true })
  port!: number;

  @OneToMany(() => PortSnapshotEntity, (snapshot) => snapshot.port)
  snapshots!: PortSnapshotEntity[];
}
