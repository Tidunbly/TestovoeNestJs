import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ScanTargetEntity } from '../types/entities/scan-target.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class ScanTargetRepository {
  constructor(
    @InjectRepository(ScanTargetEntity)
    private readonly repository: Repository<ScanTargetEntity>,
  ) {}

  async findByIp(ip: string): Promise<ScanTargetEntity | null> {
    return this.repository.findOne({ where: { ip } });
  }

  async findById(id: number): Promise<ScanTargetEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByIps(ips: string[]): Promise<ScanTargetEntity[]> {
    if (!ips.length) {
      return [];
    }

    return this.repository.find({ where: { ip: In(ips) } });
  }

  async findByIds(ids: number[]): Promise<ScanTargetEntity[]> {
    if (!ids.length) {
      return [];
    }

    return this.repository.find({ where: { id: In(ids) } });
  }

  async saveMany(items: ScanTargetEntity[]): Promise<ScanTargetEntity[]> {
    return this.repository.save(items);
  }

  create(data: Partial<ScanTargetEntity>): ScanTargetEntity {
    return this.repository.create(data);
  }

  async save(item: ScanTargetEntity): Promise<ScanTargetEntity> {
    return this.repository.save(item);
  }

  async findEnabledTargets(): Promise<ScanTargetEntity[]> {
    return this.repository.find({
      where: { isEnabled: true },
      select: {
        id: true,
        ip: true,
        isEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
