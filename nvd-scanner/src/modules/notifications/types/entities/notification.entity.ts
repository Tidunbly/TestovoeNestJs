import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'notifications' })
export class NotificationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  cveId: string;

  @Column({ type: 'float', nullable: true })
  cvssV3: number | null;

  @Column({ type: 'text' })
  hostIp: string;

  @Column({ type: 'int', nullable: true })
  port: number | null;

  @Column({ type: 'text', nullable: true })
  version: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'boolean', default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
