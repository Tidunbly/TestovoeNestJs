import { INestApplication } from '@nestjs/common';
import { createTestApp, clearTables } from './setup';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ScanTargetEntity } from '../../src/modules/targets/types/entities/scan-target.entity';
import { PortEntity } from '../../src/modules/scan/types/entities/port.entity';
import { ServiceVersionEntity } from '../../src/modules/scan/types/entities/service-version.entity';
import { PortSnapshotEntity } from '../../src/modules/scan/types/entities/port-snapshot.entity';
import { ScanRepository } from '../../src/modules/scan/repositories/scan.repository';
import { Repository } from 'typeorm';

describe('ScanRepository (integration)', () => {
  let app: INestApplication;
  let scanRepository: ScanRepository;
  let dataSource: DataSource;
  let targetRepo: Repository<ScanTargetEntity>;
  let portRepo: Repository<PortEntity>;
  let versionRepo: Repository<ServiceVersionEntity>;
  let snapshotRepo: Repository<PortSnapshotEntity>;

  beforeAll(async () => {
    app = await createTestApp();
    scanRepository = app.get(ScanRepository);
    dataSource = app.get(DataSource);
    targetRepo = app.get(getRepositoryToken(ScanTargetEntity));
    portRepo = app.get(getRepositoryToken(PortEntity));
    versionRepo = app.get(getRepositoryToken(ServiceVersionEntity));
    snapshotRepo = app.get(getRepositoryToken(PortSnapshotEntity));
  });

  beforeEach(async () => {
    await clearTables(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('getOrCreatePort', () => {
    it('should create a new port', async () => {
      const port = await scanRepository.getOrCreatePort(443);
      expect(port.id).toBeDefined();
      expect(port.port).toBe(443);

      const saved = await portRepo.findOne({ where: { port: 443 } });
      expect(saved).not.toBeNull();
    });

    it('should return existing port without duplicating', async () => {
      const port1 = await scanRepository.getOrCreatePort(80);
      const port2 = await scanRepository.getOrCreatePort(80);
      expect(port1.id).toBe(port2.id);

      const all = await portRepo.find();
      expect(all).toHaveLength(1);
    });
  });

  describe('getOrCreateVersion', () => {
    it('should create a new version', async () => {
      const version = await scanRepository.getOrCreateVersion('nginx 1.21');
      expect(version.id).toBeDefined();
      expect(version.name).toBe('nginx 1.21');
    });

    it('should return existing version without duplicating', async () => {
      const v1 = await scanRepository.getOrCreateVersion('Apache 2.4');
      const v2 = await scanRepository.getOrCreateVersion('Apache 2.4');
      expect(v1.id).toBe(v2.id);

      const all = await versionRepo.find();
      expect(all).toHaveLength(1);
    });
  });

  describe('saveSnapshots', () => {
    it('should save snapshot rows', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const port = await scanRepository.getOrCreatePort(443);
      const version = await scanRepository.getOrCreateVersion('OpenSSH 8.9');

      await scanRepository.saveSnapshots(target.id, [
        { portId: port.id, versionId: version.id, cveId: null },
      ]);

      const snapshots = await snapshotRepo.find({
        where: { ipId: target.id },
      });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].portId).toBe(port.id);
      expect(snapshots[0].versionId).toBe(version.id);
      expect(snapshots[0].cveId).toBeNull();
    });

    it('should save multiple snapshot rows at once', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.2', isEnabled: true }),
      );
      const port1 = await scanRepository.getOrCreatePort(80);
      const port2 = await scanRepository.getOrCreatePort(443);
      const version = await scanRepository.getOrCreateVersion('service v1');

      await scanRepository.saveSnapshots(target.id, [
        { portId: port1.id, versionId: version.id },
        { portId: port2.id, versionId: version.id },
      ]);

      const snapshots = await snapshotRepo.find({
        where: { ipId: target.id },
      });
      expect(snapshots).toHaveLength(2);
    });

    it('should not save when rows is empty', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.3', isEnabled: true }),
      );

      await scanRepository.saveSnapshots(target.id, []);

      const snapshots = await snapshotRepo.find({
        where: { ipId: target.id },
      });
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('getCurrentState', () => {
    it('should return empty state', async () => {
      const result = await scanRepository.getCurrentState({
        page: 1,
        limit: 20,
      } as any);
      expect(result.ips).toEqual([]);
      expect(result.totalIps).toBe(0);
    });

    it('should group snapshots by IP', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const port1 = await scanRepository.getOrCreatePort(80);
      const port2 = await scanRepository.getOrCreatePort(443);
      const version = await scanRepository.getOrCreateVersion('service v1');

      await scanRepository.saveSnapshots(target.id, [
        { portId: port1.id, versionId: version.id },
        { portId: port2.id, versionId: version.id },
      ]);

      const result = await scanRepository.getCurrentState({
        page: 1,
        limit: 20,
      } as any);

      expect(result.ips).toHaveLength(1);
      expect(result.ips[0].ipId).toBe(target.id);
      expect(result.ips[0].ports).toHaveLength(2);
      const portNumbers = result.ips[0].ports.map((p: any) => p.port).sort((a: number, b: number) => a - b);
      expect(portNumbers).toEqual([80, 443]);
    });

    it('should filter by IP IDs', async () => {
      const t1 = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const t2 = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.2', isEnabled: true }),
      );
      const port = await scanRepository.getOrCreatePort(22);
      const ver = await scanRepository.getOrCreateVersion('OpenSSH');

      await scanRepository.saveSnapshots(t1.id, [
        { portId: port.id, versionId: ver.id },
      ]);
      await scanRepository.saveSnapshots(t2.id, [
        { portId: port.id, versionId: ver.id },
      ]);

      const result = await scanRepository.getCurrentState(
        { page: 1, limit: 20 } as any,
        [t1.id],
      );

      expect(result.ips).toHaveLength(1);
      expect(result.ips[0].ipId).toBe(t1.id);
    });

    it('should filter by date range', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const port = await scanRepository.getOrCreatePort(80);
      const ver = await scanRepository.getOrCreateVersion('nginx');

      const oldDate = '2024-01-01T00:00:00Z';
      const newDate = '2025-06-15T00:00:00Z';

      await dataSource.query(
        `INSERT INTO "port_snapshots" ("ipId", "portId", "versionId", "cveId", "createdAt") VALUES ($1, $2, $3, NULL, $4)`,
        [target.id, port.id, ver.id, oldDate],
      );
      await dataSource.query(
        `INSERT INTO "port_snapshots" ("ipId", "portId", "versionId", "cveId", "createdAt") VALUES ($1, $2, $3, NULL, $4)`,
        [target.id, port.id, ver.id, newDate],
      );

      const result = await scanRepository.getCurrentState(
        {
          page: 1,
          limit: 20,
          from: '2025-01-01T00:00:00.000Z',
          to: '2025-12-31T23:59:59.000Z',
        } as any,
      );

      expect(result.ips).toHaveLength(1);
      expect(result.ips[0].ports).toHaveLength(1);
    });

    it('should paginate results', async () => {
      for (let i = 1; i <= 3; i++) {
        const target = await targetRepo.save(
          targetRepo.create({ ip: `10.0.0.${i}`, isEnabled: true }),
        );
        const port = await scanRepository.getOrCreatePort(80 + i);
        const ver = await scanRepository.getOrCreateVersion(`svc ${i}`);
        await scanRepository.saveSnapshots(target.id, [
          { portId: port.id, versionId: ver.id },
        ]);
      }

      const page1 = await scanRepository.getCurrentState({
        page: 1,
        limit: 1,
      } as any);
      expect(page1.ips).toHaveLength(1);
      expect(page1.totalIps).toBe(3);

      const page2 = await scanRepository.getCurrentState({
        page: 2,
        limit: 1,
      } as any);
      expect(page2.ips).toHaveLength(1);
    });
  });
});
