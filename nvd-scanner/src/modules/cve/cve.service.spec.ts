import { Test, TestingModule } from '@nestjs/testing';
import { CveService } from './cve.service';
import { CveRepository } from './repositories/cve.repository';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

// Helper to create a mock fetch response
function mockFetch(status: number, json: any) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    json: async () => json,
  });
}

const mockCveRepository = {
  getLastPublishedAt: jest.fn(),
  upsertMany: jest.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, def: any) => {
    const map: Record<string, any> = {
      NVD_REQUEST_TIMEOUT_MS: 20000,
      NVD_REQUEST_DELAY_MS: 0,
      NVD_FETCH_RETRY_ATTEMPTS: 1,
      NVD_FETCH_RETRY_BASE_DELAY_MS: 100,
      NVD_FETCH_RETRY_MAX_DELAY_MS: 1000,
    };
    return map[key] ?? def;
  }),
} as any;

const mockDataSource = {
  query: jest.fn().mockResolvedValue(undefined),
} as any;

describe('CveService', () => {
  let service: CveService;

  beforeEach(async () => {
    jest.spyOn(global, 'fetch');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CveService,
        { provide: CveRepository, useValue: mockCveRepository },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<CveService>(CveService);
    jest.clearAllMocks();
  });

  it('should map NVD CVE to internal shape', () => {
    // @ts-ignore – mapCve is private, access via any
    const result = (service as any).mapCve({
      id: 'CVE-2023-1234',
      published: '2023-01-01T00:00Z',
      descriptions: [{ lang: 'en', value: 'Test description' }],
      metrics: {
        cvssMetricV31: [{ cvssData: { baseScore: 7.5 } }],
        cvssMetricV30: [],
      },
    });
    expect(result).toMatchObject({
      cveId: 'CVE-2023-1234',
      cvssV3: 7.5,
      description: 'Test description',
    });
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it('should sync latest CVEs with pagination and upsert', async () => {
    // Simulate last published date null (full sync)
    mockCveRepository.getLastPublishedAt.mockResolvedValue(null);
    // First page returns two items and totalResults 2
    const firstPage = {
      vulnerabilities: [
        { cve: { id: 'CVE-1', published: '2023-01-01T00:00Z', descriptions: [{ lang: 'en', value: 'Desc1' }], metrics: {} } },
        { cve: { id: 'CVE-2', published: '2023-01-02T00:00Z', descriptions: [{ lang: 'en', value: 'Desc2' }], metrics: {} } },
      ],
      totalResults: 2,
      resultsPerPage: 2,
      startIndex: 0,
    };
    // Second fetch will return empty list, breaking loop
    const emptyPage = { vulnerabilities: [], totalResults: 2, resultsPerPage: 2, startIndex: 2 };
    (global.fetch as jest.Mock)
      .mockImplementationOnce(mockFetch(200, firstPage))
      .mockImplementationOnce(mockFetch(200, emptyPage));

    const saved = await service.syncLatest();
    expect(saved).toBe(2);
    expect(mockCveRepository.upsertMany).toHaveBeenCalledTimes(1);
    const upsertArg = (mockCveRepository.upsertMany as jest.Mock).mock.calls[0][0];
    expect(upsertArg).toHaveLength(2);
    expect(upsertArg[0]).toMatchObject({ cveId: 'CVE-1' });
    expect(upsertArg[1]).toMatchObject({ cveId: 'CVE-2' });
  });
});
