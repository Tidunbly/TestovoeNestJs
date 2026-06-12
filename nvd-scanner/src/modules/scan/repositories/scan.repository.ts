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

    interface WhereParams {
      ipIds?: number[];
      from?: Date;
      to?: Date;
    }

    function applyFilters(
      qb: any,
      params: WhereParams,
    ) {
      if (params.ipIds?.length) {
        qb.andWhere('snapshot.ipId IN (:...ipIds)', { ipIds: params.ipIds });
      }
      if (params.from) {
        qb.andWhere('snapshot.createdAt >= :from', { from: params.from });
      }
      if (params.to) {
        qb.andWhere('snapshot.createdAt <= :to', { to: params.to });
      }
      return qb;
    }

    const baseQuery = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('snapshot.ipId', 'ipId')
      .addSelect('MAX(snapshot.createdAt)', 'lastCreatedAt')
      .groupBy('snapshot.ipId');

    applyFilters(baseQuery, { ipIds, from, to });

    const totalQuery = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('COUNT(DISTINCT snapshot.ipId)', 'count');

    applyFilters(totalQuery, { ipIds, from, to });

    const totalIpsRaw = await totalQuery.getRawOne<{ count: string }>();
    const totalIps = Number(totalIpsRaw?.count ?? 0);

    const latestByIpRaw = await baseQuery
      .orderBy('MAX(snapshot.createdAt)', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany<{ ipId: string; lastCreatedAt: string }>();

    if (!latestByIpRaw.length) {
      return { page, limit, totalIps, ips: [] };
    }

    const selectedIpIds = latestByIpRaw.map((item) => Number(item.ipId));

    const snapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.port', 'port')
      .leftJoinAndSelect('snapshot.version', 'version')
      .where('snapshot.ipId IN (:...ipIds)', { ipIds: selectedIpIds })
      .andWhere(
        `(snapshot.ipId, snapshot.createdAt) IN (
          SELECT s2."ipId", MAX(s2."createdAt")
          FROM port_snapshots s2
          WHERE s2."ipId" = ANY(:latestIpIds)
          GROUP BY s2."ipId"
        )`,
        { latestIpIds: selectedIpIds },
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

      const bucket = grouped.get(row.ipId)!;
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
