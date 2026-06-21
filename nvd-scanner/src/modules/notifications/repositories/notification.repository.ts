import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../types/entities/notification.entity';

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repository: Repository<NotificationEntity>,
  ) {}

  async create(data: {
    cveId: string;
    cvssV3: number | null;
    hostIp: string;
    port: number | null;
    version: string | null;
    description: string;
  }): Promise<NotificationEntity> {
    const entity = this.repository.create({ ...data, sent: false });
    return this.repository.save(entity);
  }

  async markSent(id: number): Promise<void> {
    await this.repository.update({ id }, { sent: true });
  }

  async findUnsent(limit = 50): Promise<NotificationEntity[]> {
    return this.repository.find({
      where: { sent: false },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }
}
