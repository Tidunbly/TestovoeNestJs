import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, clearTables } from './setup';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScanTargetEntity } from '../../src/modules/targets/types/entities/scan-target.entity';
import { PortScanJobEntity } from '../../src/modules/jobs/types/entities/port-scan-job.entity';
import { CveSyncJobEntity } from '../../src/modules/jobs/types/entities/cve-sync-job.entity';
import { JobStatus } from '../../src/modules/jobs/types/job-status.enum';
import { Repository } from 'typeorm';

describe('Jobs (integration)', () => {
  let app: INestApplication<App>;
  let targetRepo: Repository<ScanTargetEntity>;
  let scanJobRepo: Repository<PortScanJobEntity>;
  let cveJobRepo: Repository<CveSyncJobEntity>;

  beforeAll(async () => {
    app = await createTestApp();
    targetRepo = app.get(getRepositoryToken(ScanTargetEntity));
    scanJobRepo = app.get(getRepositoryToken(PortScanJobEntity));
    cveJobRepo = app.get(getRepositoryToken(CveSyncJobEntity));
  });

  beforeEach(async () => {
    await clearTables(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/jobs/run-daily', () => {
    it('should create 0 scan jobs and 1 CVE job when no targets', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/jobs/run-daily')
        .expect(201);

      expect(res.body.scanJobs).toBe(0);
      expect(res.body.cveJobs).toBe(1);

      const scanJobs = await scanJobRepo.find();
      expect(scanJobs).toHaveLength(0);

      const cveJobs = await cveJobRepo.find();
      expect(cveJobs).toHaveLength(1);
      expect(cveJobs[0].status).toBe(JobStatus.PENDING);
    });

    it('should create scan jobs for all enabled targets', async () => {
      const targets = targetRepo.create([
        { ip: '1.1.1.1', isEnabled: true },
        { ip: '2.2.2.2', isEnabled: true },
        { ip: '3.3.3.3', isEnabled: true },
      ]);
      await targetRepo.save(targets);

      const res = await request(app.getHttpServer())
        .post('/api/jobs/run-daily')
        .expect(201);

      expect(res.body.scanJobs).toBe(3);
      expect(res.body.cveJobs).toBe(1);

      const scanJobs = await scanJobRepo.find();
      expect(scanJobs).toHaveLength(3);
      for (const job of scanJobs) {
        expect(job.status).toBe(JobStatus.PENDING);
        expect(job.ipId).toBeDefined();
      }
    });

    it('should only include enabled targets in scan jobs', async () => {
      const targets = targetRepo.create([
        { ip: '1.1.1.1', isEnabled: true },
        { ip: '2.2.2.2', isEnabled: false },
        { ip: '3.3.3.3', isEnabled: true },
      ]);
      await targetRepo.save(targets);

      const res = await request(app.getHttpServer())
        .post('/api/jobs/run-daily')
        .expect(201);

      expect(res.body.scanJobs).toBe(2);

      const scanJobs = await scanJobRepo.find();
      const enabledIpIds = targets.filter((t) => t.isEnabled).map((t) => t.id);
      for (const job of scanJobs) {
        expect(enabledIpIds).toContain(job.ipId);
      }
    });

    it('should create exactly one CVE sync job', async () => {
      await request(app.getHttpServer())
        .post('/api/jobs/run-daily')
        .expect(201);

      const cveJobs = await cveJobRepo.find();
      expect(cveJobs).toHaveLength(1);
      expect(cveJobs[0].status).toBe(JobStatus.PENDING);
      expect(cveJobs[0].startedAt).toBeNull();
      expect(cveJobs[0].finishedAt).toBeNull();
    });

    it('should accumulate jobs across multiple runs', async () => {
      const target = targetRepo.create({ ip: '1.1.1.1', isEnabled: true });
      await targetRepo.save(target);

      await request(app.getHttpServer())
        .post('/api/jobs/run-daily')
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/jobs/run-daily')
        .expect(201);

      const scanJobs = await scanJobRepo.find();
      expect(scanJobs).toHaveLength(2);

      const cveJobs = await cveJobRepo.find();
      expect(cveJobs).toHaveLength(2);
    });
  });
});
