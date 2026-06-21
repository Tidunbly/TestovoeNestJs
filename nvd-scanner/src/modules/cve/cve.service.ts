import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CveRepository } from '@modules/cve/repositories/cve.repository';
import { DataSource } from 'typeorm';

type NvdResponse = {
  vulnerabilities?: Array<{
    cve?: {
      id?: string;
      published?: string;
      descriptions?: Array<{ lang?: string; value?: string }>;
      metrics?: {
        cvssMetricV31?: Array<{ cvssData?: { baseScore?: number } }>;
        cvssMetricV30?: Array<{ cvssData?: { baseScore?: number } }>;
        cvssMetricV2?: Array<{ cvssData?: { baseScore?: number } }>;
      };
    };
  }>;
  totalResults?: number;
  resultsPerPage?: number;
  startIndex?: number;
};
type NvdCveItem = NonNullable<
  NonNullable<NvdResponse['vulnerabilities']>[number]['cve']
>;

@Injectable()
export class CveService implements OnModuleInit {
  private readonly logger = new Logger(CveService.name);
  private readonly requestTimeoutMs: number;
  private readonly requestDelayMs: number;
  private readonly fetchRetryAttempts: number;
  private readonly fetchRetryBaseDelayMs: number;
  private readonly fetchRetryMaxDelayMs: number;

  constructor(
    private readonly cveRepository: CveRepository,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.requestTimeoutMs = this.getNumberEnv('NVD_REQUEST_TIMEOUT_MS', 20000);
    this.requestDelayMs = this.getNumberEnv('NVD_REQUEST_DELAY_MS', 700);
    this.fetchRetryAttempts = this.getNumberEnv('NVD_FETCH_RETRY_ATTEMPTS', 3);
    this.fetchRetryBaseDelayMs = this.getNumberEnv(
      'NVD_FETCH_RETRY_BASE_DELAY_MS',
      1500,
    );
    this.fetchRetryMaxDelayMs = this.getNumberEnv(
      'NVD_FETCH_RETRY_MAX_DELAY_MS',
      15000,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown pg_trgm init error';
      this.logger.warn(`pg_trgm extension skipped: ${message}`);
    }

    try {
      await this.dataSource.query(
        'CREATE INDEX IF NOT EXISTS idx_cves_description_trgm ON cves USING GIN (description gin_trgm_ops)',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown index init error';
      this.logger.warn(`pg_trgm index skipped (benign if already exists): ${message}`);
    }
  }

  async syncLatest(): Promise<number> {
    const lastPublishedAt = await this.cveRepository.getLastPublishedAt();
    const apiKey = this.configService.get<string>('NVD_API_KEY', '');
    const perPage = 2000;
    let startIndex = 0;
    let saved = 0;
    let useDateFilter = Boolean(lastPublishedAt);

    while (true) {
      const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
      url.searchParams.set('startIndex', String(startIndex));
      url.searchParams.set('resultsPerPage', String(perPage));
      if (useDateFilter && lastPublishedAt) {
        url.searchParams.set('pubStartDate', this.toNvdDate(lastPublishedAt));
        url.searchParams.set('pubEndDate', this.toNvdDate(new Date()));
      }

      const response = await this.fetchWithRetry(url, apiKey);
      if (response.status === 404 && useDateFilter && lastPublishedAt) {
        this.logger.warn(
          'NVD returned 404 for date-filtered request, fallback to unfiltered sync',
        );
        useDateFilter = false;
        startIndex = 0;
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `NVD API error: ${response.status} ${response.statusText}`,
        );
      }

      const payload = (await response.json()) as NvdResponse;
      const vulnerabilities = payload.vulnerabilities ?? [];
      if (!vulnerabilities.length) {
        break;
      }

      const rows = vulnerabilities
        .map((item) => this.mapCve(item.cve))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      await this.cveRepository.upsertMany(rows);
      saved += rows.length;

      const total = payload.totalResults ?? vulnerabilities.length;
      startIndex += payload.resultsPerPage ?? vulnerabilities.length;
      if (startIndex >= total) {
        break;
      }

      if (this.requestDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.requestDelayMs),
        );
      }
    }

    this.logger.log(`CVE sync completed. Upsert candidates: ${saved}`);
    return saved;
  }

  async findBestCandidateForVersion(versionLabel: string) {
    return this.cveRepository.findBestCandidateByVersionLabel(versionLabel);
  }

  async findBestCandidatesForVersions(versionLabels: string[]) {
    return this.cveRepository.findBestCandidatesForVersions(versionLabels);
  }

  async getCvesByIds(ids: number[]) {
    return this.cveRepository.findByIds(ids);
  }

  private mapCve(cve: NvdCveItem | undefined): {
    cveId: string;
    cvssV3: number | null;
    description: string;
    publishedAt: Date;
  } | null {
    if (!cve?.id || !cve.published) {
      return null;
    }

    const description =
      cve.descriptions?.find((item) => item.lang === 'en')?.value ??
      cve.descriptions?.[0]?.value ??
      'No description';
    const cvss =
      cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ??
      cve.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore ??
      cve.metrics?.cvssMetricV2?.[0]?.cvssData?.baseScore ??
      null;

    return {
      cveId: cve.id,
      cvssV3: cvss,
      description,
      publishedAt: new Date(cve.published),
    };
  }

  private getNumberEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private async fetchWithRetry(url: URL, apiKey: string): Promise<Response> {
    let lastError: unknown;
    const totalAttempts = this.fetchRetryAttempts + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        const response = await this.fetchOnce(url, apiKey);
        if (
          this.isRetryableStatus(response.status) &&
          attempt < totalAttempts
        ) {
          const delayMs = this.getRetryDelayMs(attempt);
          this.logger.warn(
            `NVD temporary HTTP ${response.status} on attempt ${attempt}/${totalAttempts}. Retry in ${delayMs}ms`,
          );
          await this.sleep(delayMs);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (!this.isRetryableFetchError(error) || attempt >= totalAttempts) {
          throw error;
        }

        const delayMs = this.getRetryDelayMs(attempt);
        this.logger.warn(
          `NVD fetch network failure on attempt ${attempt}/${totalAttempts}: ${this.describeFetchError(error)}. Retry in ${delayMs}ms`,
        );
        await this.sleep(delayMs);
      }
    }

    throw lastError ?? new Error('NVD request failed after retries');
  }

  private async fetchOnce(url: URL, apiKey: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await fetch(url, {
        headers: apiKey ? { apiKey } : {},
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryableStatus(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
  }

  private isRetryableFetchError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error.name === 'AbortError') {
      return true;
    }

    const code = this.extractErrorCode(error);
    return code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ETIMEDOUT';
  }

  private extractErrorCode(error: Error): string | undefined {
    const directCode = Reflect.get(error, 'code');
    if (typeof directCode === 'string') {
      return directCode;
    }

    const cause = Reflect.get(error, 'cause');
    if (cause && typeof cause === 'object') {
      const nestedCode = Reflect.get(cause, 'code');
      if (typeof nestedCode === 'string') {
        return nestedCode;
      }
    }

    return undefined;
  }

  private describeFetchError(error: unknown): string {
    if (error instanceof AggregateError) {
      const nestedMessages = error.errors
        .map((entry) =>
          entry instanceof Error ? `${entry.name}: ${entry.message}` : String(entry),
        )
        .join('; ');
      return `${error.message}${nestedMessages ? ` | nested: ${nestedMessages}` : ''}`;
    }

    if (error instanceof Error) {
      const code = this.extractErrorCode(error);
      return `${error.name}: ${error.message}${code ? ` (code=${code})` : ''}`;
    }

    return String(error);
  }

  private getRetryDelayMs(attempt: number): number {
    const exponential = this.fetchRetryBaseDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exponential, this.fetchRetryMaxDelayMs);
    const jitter = Math.floor(capped * 0.2 * Math.random());
    return capped + jitter;
  }

  private toNvdDate(date: Date): string {
    return date.toISOString().replace('Z', '');
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
