import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, clearTables } from './setup';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ScanTargetEntity } from '../../src/modules/targets/types/entities/scan-target.entity';
import { PortEntity } from '../../src/modules/scan/types/entities/port.entity';
import { ServiceVersionEntity } from '../../src/modules/scan/types/entities/service-version.entity';
import { PortSnapshotEntity } from '../../src/modules/scan/types/entities/port-snapshot.entity';
import { CveEntity } from '../../src/modules/cve/types/entities/cve.entity';
import { ScanRepository } from '../../src/modules/scan/repositories/scan.repository';

describe('Scan state (integration)', () => {
  let app: INestApplication<App>;
  let scanRepository: ScanRepository;
  let dataSource: DataSource;
  let targetRepo: Repository<ScanTargetEntity>;
  let portRepo: Repository<PortEntity>;
  let versionRepo: Repository<ServiceVersionEntity>;
  let cveRepo: Repository<CveEntity>;

  beforeAll(async () => {
    app = await createTestApp();
    scanRepository = app.get(ScanRepository);
    dataSource = app.get(DataSource);
    targetRepo = app.get(getRepositoryToken(ScanTargetEntity));
    portRepo = app.get(getRepositoryToken(PortEntity));
    versionRepo = app.get(getRepositoryToken(ServiceVersionEntity));
    cveRepo = app.get(getRepositoryToken(CveEntity));
  });

  beforeEach(async () => {
    await clearTables(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/scan/state', () => {
    it('should return empty state when no data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/scan/state')
        .expect(200);

      expect(res.body.ips).toEqual([]);
      expect(res.body.totalIps).toBe(0);
    });

    it('should return scan state with port and version', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const port = await portRepo.save(portRepo.create({ port: 443 }));
      const version = await versionRepo.save(
        versionRepo.create({ name: 'OpenSSH 8.9p1' }),
      );
      await scanRepository.saveSnapshots(target.id, [
        { portId: port.id, versionId: version.id, cveId: null },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/scan/state')
        .expect(200);

      expect(res.body.ips).toHaveLength(1);
      expect(res.body.ips[0].ip).toBe('10.0.0.1');
      expect(res.body.ips[0].ports).toHaveLength(1);
      expect(res.body.ips[0].ports[0].port).toBe(443);
      expect(res.body.ips[0].ports[0].version).toBe('OpenSSH 8.9p1');
      expect(res.body.ips[0].ports[0].cves).toEqual([]);
      expect(res.body.ips[0].createdAt).toBeDefined();
    });

    it('should include matched CVE in scan state', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.2', isEnabled: true }),
      );
      const port = await portRepo.save(portRepo.create({ port: 80 }));
      const version = await versionRepo.save(
        versionRepo.create({ name: 'Apache httpd 2.4.41' }),
      );
      const cve = await cveRepo.save(
        cveRepo.create({
          cveId: 'CVE-2024-0001',
          cvssV3: 9.8,
          description: 'Remote code execution in Apache httpd',
          publishedAt: new Date('2024-01-15'),
        }),
      );
      await scanRepository.saveSnapshots(target.id, [
        { portId: port.id, versionId: version.id, cveId: cve.id },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/scan/state')
        .expect(200);

      expect(res.body.ips[0].ports[0].cves).toHaveLength(1);
      expect(res.body.ips[0].ports[0].cves[0].cve).toBe('CVE-2024-0001');
      expect(res.body.ips[0].ports[0].cves[0].description).toBe(
        'Remote code execution in Apache httpd',
      );
    });

    it('should filter by IP addresses', async () => {
      const t1 = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const t2 = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.2', isEnabled: true }),
      );
      const port = await portRepo.save(portRepo.create({ port: 22 }));
      const ver = await versionRepo.save(
        versionRepo.create({ name: 'OpenSSH 8.9' }),
      );
      await scanRepository.saveSnapshots(t1.id, [
        { portId: port.id, versionId: ver.id },
      ]);
      await scanRepository.saveSnapshots(t2.id, [
        { portId: port.id, versionId: ver.id },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/scan/state?ips=10.0.0.1')
        .expect(200);

      expect(res.body.ips).toHaveLength(1);
      expect(res.body.ips[0].ip).toBe('10.0.0.1');
      expect(res.body.totalIps).toBe(1);
    });

    it('should filter by date period', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const port = await portRepo.save(portRepo.create({ port: 80 }));
      const ver = await versionRepo.save(
        versionRepo.create({ name: 'nginx 1.21' }),
      );

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

      const res = await request(app.getHttpServer())
        .get('/api/scan/state?from=2025-01-01T00:00:00.000Z&to=2025-12-31T23:59:59.000Z')
        .expect(200);

      expect(res.body.ips).toHaveLength(1);
      expect(res.body.ips[0].ports).toHaveLength(1);
    });

    it('should paginate results', async () => {
      for (let i = 1; i <= 3; i++) {
        const target = await targetRepo.save(
          targetRepo.create({ ip: `10.0.0.${i}`, isEnabled: true }),
        );
        const port = await portRepo.save(portRepo.create({ port: 80 + i }));
        const ver = await versionRepo.save(
          versionRepo.create({ name: `service ${i}` }),
        );
        await scanRepository.saveSnapshots(target.id, [
          { portId: port.id, versionId: ver.id },
        ]);
      }

      const page1 = await request(app.getHttpServer())
        .get('/api/scan/state?page=1&limit=1')
        .expect(200);

      expect(page1.body.ips).toHaveLength(1);
      expect(page1.body.totalIps).toBe(3);
      expect(page1.body.page).toBe(1);
      expect(page1.body.limit).toBe(1);

      const page2 = await request(app.getHttpServer())
        .get('/api/scan/state?page=2&limit=1')
        .expect(200);

      expect(page2.body.ips).toHaveLength(1);
    });

    it('should return 400 for invalid page parameter', async () => {
      await request(app.getHttpServer())
        .get('/api/scan/state?page=0')
        .expect(400);
    });

    it('should return 400 for limit exceeding max', async () => {
      await request(app.getHttpServer())
        .get('/api/scan/state?limit=101')
        .expect(400);
    });

    it('should take only latest snapshot per IP', async () => {
      const target = await targetRepo.save(
        targetRepo.create({ ip: '10.0.0.1', isEnabled: true }),
      );
      const port1 = await portRepo.save(portRepo.create({ port: 80 }));
      const port2 = await portRepo.save(portRepo.create({ port: 443 }));
      const ver = await versionRepo.save(
        versionRepo.create({ name: 'service v1' }),
      );

      const oldDate = '2024-01-01T00:00:00Z';
      const newDate = '2025-06-15T00:00:00Z';

      await dataSource.query(
        `INSERT INTO "port_snapshots" ("ipId", "portId", "versionId", "cveId", "createdAt") VALUES ($1, $2, $3, NULL, $4)`,
        [target.id, port1.id, ver.id, oldDate],
      );
      await dataSource.query(
        `INSERT INTO "port_snapshots" ("ipId", "portId", "versionId", "cveId", "createdAt") VALUES ($1, $2, $3, NULL, $4)`,
        [target.id, port2.id, ver.id, newDate],
      );

      const res = await request(app.getHttpServer())
        .get('/api/scan/state')
        .expect(200);

      expect(res.body.ips).toHaveLength(1);
      expect(res.body.ips[0].ports).toHaveLength(1);
      expect(res.body.ips[0].ports[0].port).toBe(443);
    });
  });
});
