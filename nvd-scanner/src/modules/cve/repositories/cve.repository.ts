import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CveEntity } from '@modules/cve/types/entities/cve.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class CveRepository {
  constructor(
    @InjectRepository(CveEntity)
    private readonly repository: Repository<CveEntity>,
  ) {}

  async getLastPublishedAt(): Promise<Date | null> {
    const row = await this.repository
      .createQueryBuilder('cve')
      .select('MAX(cve.publishedAt)', 'maxPublishedAt')
      .getRawOne<{ maxPublishedAt: string | null }>();

    return row?.maxPublishedAt ? new Date(row.maxPublishedAt) : null;
  }

  async upsertMany(
    rows: Array<Omit<CveEntity, 'id' | 'snapshots'>>,
  ): Promise<void> {
    if (!rows.length) {
      return;
    }

    await this.repository
      .createQueryBuilder()
      .insert()
      .into(CveEntity)
      .values(rows)
      .orIgnore()
      .execute();
  }

  async findBestCandidateByVersionLabel(
    versionLabel: string,
  ): Promise<CveEntity | null> {
    const normalized = versionLabel
      .toLowerCase()
      .replace(/[^a-z0-9.\- ]/g, ' ');
    const tokens = [
      ...new Set(normalized.split(/\s+/).filter((token) => token.length >= 2)),
    ];
    if (!tokens.length) {
      return null;
    }

    const candidates = await this.repository
      .createQueryBuilder('cve')
      .where(
        tokens
          .map((_, idx) => `cve.description ILIKE :token${idx}`)
          .join(' OR '),
        Object.fromEntries(
          tokens.map((token, idx) => [`token${idx}`, `%${token}%`]),
        ),
      )
      .orderBy('cve.publishedAt', 'DESC')
      .limit(50)
      .getMany();

    let best: { row: CveEntity; matches: number } | null = null;
    for (const row of candidates) {
      const text = row.description.toLowerCase();
      const matches = tokens.reduce(
        (count, token) => (text.includes(token) ? count + 1 : count),
        0,
      );
      if (matches < 3) {
        continue;
      }

      if (!best || matches > best.matches) {
        best = { row, matches };
      }
    }

    return best?.row ?? null;
  }

  async findByIds(ids: number[]): Promise<CveEntity[]> {
    if (!ids.length) {
      return [];
    }

    return this.repository.find({ where: { id: In(ids) } });
  }
}
