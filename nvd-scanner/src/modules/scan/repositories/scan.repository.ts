import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PortEntity } from '@modules/scan/types/entities/port.entity';
import { Repository } from 'typeorm';
import { ServiceVersionEntity } from '@modules/scan/types/entities/service-version.entity';
import { PortSnapshotEntity } from '@modules/scan/types/entities/port-snapshot.entity';
import { GetCurrentStateDto } from '@modules/scan/dto/get-current-state.dto';

@Injectable()
export class ScanRepository {
  constructor(
    @InjectRepository(PortEntity)
    private readonly portRepository: Repository<PortEntity>,
    @InjectRepository(ServiceVersionEntity)
    private readonly versionRepository: Repository<ServiceVersionEntity>,
    @InjectRepository(PortSnapshotEntity)
    private readonly snapshotRepository: Repository<PortSnapshotEntity>,
  ) {}

  async getOrCreatePort(port: number): Promise<PortEntity> {
    let item = await this.portRepository.findOne({ where: { port } });
    if (item) {
      return item;
    }

    item = this.portRepository.create({ port });
    try {
      return await this.portRepository.save(item);
    } catch {
      return (await this.portRepository.findOne({
        where: { port },
      })) as PortEntity;
    }
  }

  async getOrCreateVersion(name: string): Promise<ServiceVersionEntity> {
    let item = await this.versionRepository.findOne({ where: { name } });
    if (item) {
      return item;
    }

    item = this.versionRepository.create({ name });
    try {
      return await this.versionRepository.save(item);
    } catch {
      return (await this.versionRepository.findOne({
        where: { name },
      })) as ServiceVersionEntity;
    }
  }

  async saveSnapshots(
    ipId: number,
    rows: Array<{ portId: number; versionId: number; cveId?: number | null }>,
  ): Promise<void> {
    if (!rows.length) {
      return;
    }

    await this.snapshotRepository.insert(
      rows.map((row) =>
        this.snapshotRepository.create({
          ipId,
          portId: row.portId,
          versionId: row.versionId,
          cveId: row.cveId ?? null,
        }),
      ),
    );
  }

  async getCurrentState(dto: GetCurrentStateDto, ipIds?: number[]) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;
    const from = dto.from ? new Date(dto.from) : undefined;
    const to = dto.to ? new Date(dto.to) : undefined;

    const baseLatestByIpQuery = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('snapshot.ipId', 'ipId')
      .addSelect('MAX(snapshot.createdAt)', 'lastCreatedAt')
      .where('1=1')
      .andWhere(ipIds?.length ? 'snapshot.ipId IN (:...ipIds)' : '1=1', { ipIds })
      .andWhere(from ? 'snapshot.createdAt >= :from' : '1=1', { from })
      .andWhere(to ? 'snapshot.createdAt <= :to' : '1=1', { to })
      .groupBy('snapshot.ipId');

    const totalIpsRaw = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('COUNT(DISTINCT snapshot.ipId)', 'count')
      .where('1=1')
      .andWhere(ipIds?.length ? 'snapshot.ipId IN (:...ipIds)' : '1=1', { ipIds })
      .andWhere(from ? 'snapshot.createdAt >= :from' : '1=1', { from })
      .andWhere(to ? 'snapshot.createdAt <= :to' : '1=1', { to })
      .getRawOne<{ count: string }>();
    const totalIps = Number(totalIpsRaw?.count ?? 0);

    const latestByIpRaw = await baseLatestByIpQuery
      .orderBy('MAX(snapshot.createdAt)', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany<{ ipId: string; lastCreatedAt: string }>();

    if (!latestByIpRaw.length) {
      return { page, limit, totalIps, ips: [] };
    }

    const latestPairs = latestByIpRaw.map((item) => ({
      ipId: Number(item.ipId),
      lastCreatedAt: new Date(item.lastCreatedAt),
    }));

    const selectedIpIds = latestPairs.map((item) => item.ipId);
    const snapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.port', 'port')
      .leftJoinAndSelect('snapshot.version', 'version')
      .where('snapshot.ipId IN (:...ipIds)', { ipIds: selectedIpIds })
      .andWhere(
        `snapshot.createdAt = (
          SELECT MAX(s2."createdAt")
          FROM port_snapshots s2
          WHERE s2."ipId" = snapshot."ipId"
          ${from ? 'AND s2."createdAt" >= :from' : ''}
          ${to ? 'AND s2."createdAt" <= :to' : ''}
        )`,
        { from, to },
      )
      .getMany();

    const grouped = new Map<
      number,
      {
        ipId: number;
        createdAt: Date;
        ports: Array<{
          port: number;
          version: string;
          cveId: number | null;
        }>;
      }
    >();

    for (const row of snapshots) {
      if (!grouped.has(row.ipId)) {
        grouped.set(row.ipId, {
          ipId: row.ipId,
          createdAt: row.createdAt,
          ports: [],
        });
      }

      const bucket = grouped.get(row.ipId) as {
        ipId: number;
        createdAt: Date;
        ports: Array<{
          port: number;
          version: string;
          cveId: number | null;
        }>;
      };
      bucket.ports.push({
        port: row.port.port,
        version: row.version.name,
        cveId: row.cveId ?? null,
      });
    }

    return {
      page,
      limit,
      totalIps,
      ips: [...grouped.values()],
    };
  }
}
