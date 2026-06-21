import { Injectable } from '@nestjs/common';
import { ScanRepository } from '@modules/scan/repositories/scan.repository';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CveService } from '@modules/cve/cve.service';
import { GetCurrentStateDto } from '@modules/scan/dto/get-current-state.dto';
import { ConfigService } from '@nestjs/config';
import { TargetsService } from '@modules/targets/targets.service';
import { NotificationsService } from '@modules/notifications/notifications.service';

const execFileAsync = promisify(execFile);

interface ParsedPort {
  port: number;
  version: string;
}

@Injectable()
export class ScanService {
  private readonly nmapTimeoutMs: number;

  constructor(
    private readonly scanRepository: ScanRepository,
    private readonly cveService: CveService,
    private readonly targetsService: TargetsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.nmapTimeoutMs = this.getNumberEnv('NMAP_TIMEOUT_MS', 45000);
  }

  async scanIp(ip: string, ipId: number): Promise<number> {
    const parsedPorts = await this.runNmap(ip);
    if (!parsedPorts.length) {
      return 0;
    }

    const uniqueVersions = [...new Set(parsedPorts.map((p) => p.version))];
    const versionToCve = await this.cveService.findBestCandidatesForVersions(
      uniqueVersions,
    );

    const snapshotRows: Array<{
      portId: number;
      versionId: number;
      cveId: number | null;
    }> = [];
    for (const item of parsedPorts) {
      const port = await this.scanRepository.getOrCreatePort(item.port);
      const version = await this.scanRepository.getOrCreateVersion(
        item.version,
      );
      const matchedCve = versionToCve.get(item.version) ?? null;
      snapshotRows.push({
        portId: port.id,
        versionId: version.id,
        cveId: matchedCve?.id ?? null,
      });
    }

    await this.scanRepository.saveSnapshots(ipId, snapshotRows);

    const notifiedCves = new Set<string>();
    for (const item of parsedPorts) {
      const matchedCve = versionToCve.get(item.version);
      if (!matchedCve || notifiedCves.has(matchedCve.cveId)) {
        continue;
      }
      notifiedCves.add(matchedCve.cveId);
      this.notificationsService.notifyCriticalCve({
        cveId: matchedCve.cveId,
        cvssV3: matchedCve.cvssV3,
        hostIp: ip,
        port: item.port,
        version: item.version,
        description: matchedCve.description,
      }).catch(() => {});
    }

    return snapshotRows.length;
  }

  async getCurrentState(dto: GetCurrentStateDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    let filteredTargetIds: number[] | undefined;
    if (dto.ips?.length) {
      const rows = await this.targetsService.getTargetsByIps(dto.ips);
      filteredTargetIds = rows.map((item) => item.id);
      if (filteredTargetIds.length === 0) {
        return { page, limit, totalIps: 0, ips: [] };
      }
    }

    const repoDto = { ...dto, from: dto.period?.from, to: dto.period?.to } as any;
    const state = await this.scanRepository.getCurrentState(repoDto, filteredTargetIds);
    const ipIds = state.ips.map((item) => item.ipId);
    const cveIds = [
      ...new Set(
        state.ips.flatMap((item) =>
          item.ports.map((port) => port.cveId).filter((cveId): cveId is number => Boolean(cveId)),
        ),
      ),
    ];

    const targets = await this.targetsService.getTargetsByIds(ipIds);
    const cves = await this.cveService.getCvesByIds(cveIds);
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const cveById = new Map(cves.map((cve) => [cve.id, cve]));

    return {
      page: state.page,
      limit: state.limit,
      totalIps: state.totalIps,
      ips: state.ips
        .map((item) => {
          const target = targetById.get(item.ipId);
          if (!target) {
            return null;
          }

          return {
            ip: target.ip,
            ports: item.ports.map((port) => {
              const cve = port.cveId ? cveById.get(port.cveId) : null;
              return {
                port: port.port,
                version: port.version,
                cves: cve ? [{ cve: cve.cveId, description: cve.description }] : [],
              };
            }),
            createdAt: item.createdAt.toISOString(),
          };
        })
        .filter(Boolean),
    };
  }

  private async runNmap(ip: string): Promise<ParsedPort[]> {
    const { stdout } = await execFileAsync(
      'nmap',
      ['-sV', '--open', '-oG', '-', ip],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 10,
        timeout: this.nmapTimeoutMs,
      },
    );

    const ports = new Map<number, ParsedPort>();
    const lines = stdout.split('\n');
    for (const rawLine of lines) {
      if (!rawLine.startsWith('Host:') || !rawLine.includes('Ports:')) {
        continue;
      }

      const portsPart = rawLine.split('Ports:')[1]?.trim();
      if (!portsPart) {
        continue;
      }

      const entries = portsPart.split(',');
      for (const entry of entries) {
        const trimmed = entry.trim();
        const parts = trimmed.split('/');
        if (parts.length < 7 || parts[1] !== 'open') {
          continue;
        }

        const portNumber = Number(parts[0]);
        if (!Number.isInteger(portNumber) || portNumber <= 0) {
          continue;
        }

        const service = parts[4]?.trim() || 'unknown';
        const version = parts[6]?.trim();
        const label = version ? `${service} ${version}`.trim() : service;

        ports.set(portNumber, {
          port: portNumber,
          version: label,
        });
      }
    }

    return [...ports.values()];
  }

  private getNumberEnv(key: string, fallback: number): number {
    const raw = this.configService.get<string | number>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
