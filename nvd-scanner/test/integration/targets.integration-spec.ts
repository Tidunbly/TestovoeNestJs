import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, clearTables } from './setup';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScanTargetEntity } from '../../src/modules/targets/types/entities/scan-target.entity';
import { Repository } from 'typeorm';
import { TargetResolverService } from '../../src/modules/targets/services/target-resolver.service';

describe('Targets (integration)', () => {
  let app: INestApplication<App>;
  let targetRepo: Repository<ScanTargetEntity>;

  beforeAll(async () => {
    app = await createTestApp();
    targetRepo = app.get(getRepositoryToken(ScanTargetEntity));
  });

  beforeEach(async () => {
    await clearTables(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/targets', () => {
    it('should add a valid IP address', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['1.2.3.4'] })
        .expect(201);

      expect(res.body.added).toContain('1.2.3.4');
      expect(res.body.reEnabled).toEqual([]);
      expect(res.body.rejected).toEqual([]);

      const rows = await targetRepo.find();
      expect(rows).toHaveLength(1);
      expect(rows[0].ip).toBe('1.2.3.4');
      expect(rows[0].isEnabled).toBe(true);
    });

    it('should add a valid domain', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['example.com'] })
        .expect(201);

      expect(res.body.added).toContain('example.com');
      expect(res.body.rejected).toEqual([]);

      const rows = await targetRepo.find();
      expect(rows).toHaveLength(1);
      expect(rows[0].ip).toBe('93.184.216.34');
    });

    it('should add multiple targets at once', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['1.1.1.1', '2.2.2.2'] })
        .expect(201);

      expect(res.body.added.sort()).toEqual(['1.1.1.1', '2.2.2.2'].sort());

      const rows = await targetRepo.find();
      expect(rows).toHaveLength(2);
    });

    it('should re-enable a disabled target', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['5.5.5.5'] })
        .expect(201);

      await request(app.getHttpServer())
        .patch('/api/targets/toggle')
        .send({ resource: '5.5.5.5', enabled: false })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['5.5.5.5'] })
        .expect(201);

      expect(res.body.reEnabled).toContain('5.5.5.5');
      expect(res.body.added).toEqual([]);

      const row = await targetRepo.findOne({ where: { ip: '5.5.5.5' } });
      expect(row!.isEnabled).toBe(true);
    });

    it('should reject an unresolvable domain', async () => {
      const resolver = app.get(TargetResolverService);
      (resolver.resolveToIpv4 as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['nonexistent.invalid'] })
        .expect(201);

      expect(res.body.rejected).toHaveLength(1);
      expect(res.body.rejected[0].resource).toBe('nonexistent.invalid');
      expect(res.body.added).toEqual([]);
    });

    it('should return 400 for empty resources array', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: [] })
        .expect(400);
    });

    it('should return 400 for missing resources', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({})
        .expect(400);
    });

    it('should return 400 for non-string items', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: [123] })
        .expect(400);
    });

    it('should not duplicate an already-enabled target', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['10.0.0.1'] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['10.0.0.1'] })
        .expect(201);

      expect(res.body.added).toEqual([]);
      expect(res.body.reEnabled).toEqual([]);
      expect(res.body.rejected).toEqual([]);

      const rows = await targetRepo.find();
      expect(rows).toHaveLength(1);
    });
  });

  describe('GET /api/targets', () => {
    it('should return empty list initially', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/targets')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return added targets', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['1.1.1.1', '2.2.2.2'] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/targets')
        .expect(200);

      expect(res.body).toHaveLength(2);
      const ips = res.body.map((t: any) => t.ip).sort();
      expect(ips).toEqual(['1.1.1.1', '2.2.2.2']);
    });
  });

  describe('PATCH /api/targets/toggle', () => {
    it('should disable an enabled target', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['3.3.3.3'] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch('/api/targets/toggle')
        .send({ resource: '3.3.3.3', enabled: false })
        .expect(200);

      expect(res.body).toEqual({ ip: '3.3.3.3', enabled: false });
    });

    it('should enable a disabled target', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['4.4.4.4'] })
        .expect(201);

      await request(app.getHttpServer())
        .patch('/api/targets/toggle')
        .send({ resource: '4.4.4.4', enabled: false })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch('/api/targets/toggle')
        .send({ resource: '4.4.4.4', enabled: true })
        .expect(200);

      expect(res.body).toEqual({ ip: '4.4.4.4', enabled: true });
    });

    it('should return 404 for unregistered IP', async () => {
      await request(app.getHttpServer())
        .patch('/api/targets/toggle')
        .send({ resource: '9.9.9.9', enabled: false })
        .expect(404);
    });

    it('should return 400 for invalid body', async () => {
      await request(app.getHttpServer())
        .patch('/api/targets/toggle')
        .send({ resource: 123 })
        .expect(400);
    });
  });

  describe('DELETE /api/targets', () => {
    it('should delete all targets', async () => {
      await request(app.getHttpServer())
        .post('/api/targets')
        .send({ resources: ['1.1.1.1', '2.2.2.2'] })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete('/api/targets')
        .expect(200);

      expect(res.body.deleted).toBe(2);

      const rows = await targetRepo.find();
      expect(rows).toHaveLength(0);
    });

    it('should return deleted: 0 when empty', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/targets')
        .expect(200);

      expect(res.body.deleted).toBe(0);
    });
  });
});
