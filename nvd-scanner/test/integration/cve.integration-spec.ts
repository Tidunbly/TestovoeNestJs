import { INestApplication } from '@nestjs/common';
import { createTestApp, clearTables } from './setup';
import { CveRepository } from '../../src/modules/cve/repositories/cve.repository';
import { CveEntity } from '../../src/modules/cve/types/entities/cve.entity';
import { CveService } from '../../src/modules/cve/cve.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('CveService (integration)', () => {
  let app: INestApplication;
  let cveService: CveService;
  let cveRepository: CveRepository;
  let cveRepo: Repository<CveEntity>;

  beforeAll(async () => {
    app = await createTestApp();
    cveService = app.get(CveService);
    cveRepository = app.get(CveRepository);
    cveRepo = app.get(getRepositoryToken(CveEntity));
  });

  beforeEach(async () => {
    await clearTables(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('upsertMany', () => {
    it('should insert new CVE records', async () => {
      const rows = [
        {
          cveId: 'CVE-2024-0001',
          cvssV3: 9.8,
          description: 'Critical remote code execution in Apache httpd',
          publishedAt: new Date('2024-01-15'),
        },
        {
          cveId: 'CVE-2024-0002',
          cvssV3: 7.5,
          description: 'High severity vulnerability in OpenSSL',
          publishedAt: new Date('2024-02-10'),
        },
      ];

      await cveRepository.upsertMany(rows);

      const saved = await cveRepo.find();
      expect(saved).toHaveLength(2);
      const cveIds = saved.map((c) => c.cveId).sort();
      expect(cveIds).toEqual(['CVE-2024-0001', 'CVE-2024-0002']);
    });

    it('should update existing CVE on conflict', async () => {
      const rows = [
        {
          cveId: 'CVE-2024-0001',
          cvssV3: 5.0,
          description: 'Old description',
          publishedAt: new Date('2024-01-15'),
        },
      ];

      await cveRepository.upsertMany(rows);

      const updatedRows = [
        {
          cveId: 'CVE-2024-0001',
          cvssV3: 9.9,
          description: 'Updated description with higher severity',
          publishedAt: new Date('2024-01-20'),
        },
      ];

      await cveRepository.upsertMany(updatedRows);

      const saved = await cveRepo.find();
      expect(saved).toHaveLength(1);
      expect(saved[0].cvssV3).toBe(9.9);
      expect(saved[0].description).toBe('Updated description with higher severity');
    });

    it('should handle empty array gracefully', async () => {
      await cveRepository.upsertMany([]);
      const saved = await cveRepo.find();
      expect(saved).toHaveLength(0);
    });
  });

  describe('getLastPublishedAt', () => {
    it('should return null on empty table', async () => {
      const result = await cveRepository.getLastPublishedAt();
      expect(result).toBeNull();
    });

    it('should return the latest publishedAt', async () => {
      const rows = [
        {
          cveId: 'CVE-2024-0001',
          cvssV3: 5.0,
          description: 'Test CVE 1',
          publishedAt: new Date('2024-01-01'),
        },
        {
          cveId: 'CVE-2024-0002',
          cvssV3: 7.0,
          description: 'Test CVE 2',
          publishedAt: new Date('2024-06-15'),
        },
        {
          cveId: 'CVE-2024-0003',
          cvssV3: 3.0,
          description: 'Test CVE 3',
          publishedAt: new Date('2024-03-01'),
        },
      ];

      await cveRepository.upsertMany(rows);

      const result = await cveRepository.getLastPublishedAt();
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
    });
  });

  describe('findBestCandidatesForVersions', () => {
    beforeEach(async () => {
      const rows = [
        {
          cveId: 'CVE-2024-0001',
          cvssV3: 9.8,
          description:
            'Critical vulnerability in Apache httpd 2.4.41 allows remote code execution via crafted request',
          publishedAt: new Date('2024-01-15'),
        },
        {
          cveId: 'CVE-2024-0002',
          cvssV3: 6.5,
          description:
            'OpenSSH server 8.9p1 has a medium severity issue with authentication bypass',
          publishedAt: new Date('2024-02-10'),
        },
        {
          cveId: 'CVE-2024-0003',
          cvssV3: 4.0,
          description: 'Low severity issue in nginx web server',
          publishedAt: new Date('2024-03-01'),
        },
      ];
      await cveRepository.upsertMany(rows);
    });

    it('should find matching CVE for version label', async () => {
      const result = await cveService.findBestCandidatesForVersions([
        'Apache httpd 2.4.41',
      ]);

      const match = result.get('Apache httpd 2.4.41');
      expect(match).not.toBeNull();
      expect(match!.cveId).toBe('CVE-2024-0001');
    });

    it('should return null for non-matching version', async () => {
      const result = await cveService.findBestCandidatesForVersions([
        'MySQL 8.0.30',
      ]);

      const match = result.get('MySQL 8.0.30');
      expect(match).toBeNull();
    });

    it('should handle multiple versions at once', async () => {
      const result = await cveService.findBestCandidatesForVersions([
        'Apache httpd 2.4.41',
        'OpenSSH server 8.9p1',
        'MySQL 8.0.30',
      ]);

      expect(result.get('Apache httpd 2.4.41')?.cveId).toBe('CVE-2024-0001');
      expect(result.get('OpenSSH server 8.9p1')?.cveId).toBe('CVE-2024-0002');
      expect(result.get('MySQL 8.0.30')).toBeNull();
    });

    it('should return null for version with too few token matches', async () => {
      const result = await cveService.findBestCandidatesForVersions([
        'httpd',
      ]);

      const match = result.get('httpd');
      expect(match).toBeNull();
    });
  });

  describe('findBestCandidateForVersion', () => {
    it('should find best candidate for a single version', async () => {
      await cveRepository.upsertMany([
        {
          cveId: 'CVE-2024-0100',
          cvssV3: 8.0,
          description: 'Critical OpenSSL 1.1.1 library remote code execution vulnerability',
          publishedAt: new Date('2024-01-01'),
        },
      ]);

      const result = await cveService.findBestCandidateForVersion(
        'OpenSSL library 1.1.1',
      );
      expect(result).not.toBeNull();
      expect(result!.cveId).toBe('CVE-2024-0100');
    });

    it('should return null when no match found', async () => {
      const result = await cveService.findBestCandidateForVersion(
        'PostgreSQL 14.0',
      );
      expect(result).toBeNull();
    });
  });
});
