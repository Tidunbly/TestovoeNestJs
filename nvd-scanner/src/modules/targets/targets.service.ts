import { Injectable, NotFoundException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AddTargetsDto } from './dto/add-targets.dto';
import { ToggleTargetDto } from './dto/toggle-target.dto';
import { ScanTargetRepository } from './repositories/scan-target.repository';
import { TargetResolverService } from './services/target-resolver.service';
import { ScanTargetEntity } from './types/entities/scan-target.entity';

export interface AddTargetsResult {
  added: string[];
  reEnabled: string[];
  rejected: Array<{ resource: string; reason: string }>;
}

@Injectable()
export class TargetsService {
  constructor(
    private readonly scanTargetRepository: ScanTargetRepository,
    private readonly targetResolverService: TargetResolverService,
  ) {}

  private readonly execFileAsync = promisify(execFile);

  
  private async pingIp(ip: string): Promise<boolean> {
    const isWin = process.platform === 'win32';
    const args = isWin ? ['-n', '1', ip] : ['-c', '1', ip];
    try {
      const { stdout } = await this.execFileAsync('ping', args, {
        windowsHide: true,
        timeout: 5000,
      });
      return /ttl=/i.test(stdout);
    } catch {
      return false;
    }
  }

  async addTargets(dto: AddTargetsDto): Promise<AddTargetsResult> {
    const uniqueResources = [
      ...new Set(dto.resources.map((item) => item.trim())),
    ].filter(Boolean);
    const resolved = await Promise.all(
      uniqueResources.map(async (resource) => {
        const ip = await this.targetResolverService.resolveToIpv4(resource);
        if (!ip) {
          return { resource, ip: null };
        }
        const reachable = await this.pingIp(ip);
        return { resource, ip: reachable ? ip : null };
      }),
    );

    const validResolved = resolved.filter(
      (item): item is { resource: string; ip: string } => Boolean(item.ip),
    );
    const resolvedIps = [...new Set(validResolved.map((item) => item.ip))];

    const resourcesByIp = new Map<string, string[]>();
    for (const { resource, ip } of validResolved) {
      const list = resourcesByIp.get(ip) ?? [];
      list.push(resource);
      resourcesByIp.set(ip, list);
    }

    const existing = await this.scanTargetRepository.findByIps(resolvedIps);
    const existingByIp = new Map(existing.map((item) => [item.ip, item]));

    const added: string[] = [];
    const reEnabled: string[] = [];
    const toCreate: ScanTargetEntity[] = [];

    for (const ip of resolvedIps) {
      const resourcesForIp = [...new Set(resourcesByIp.get(ip) ?? [])];
      const existingTarget = existingByIp.get(ip);
      if (!existingTarget) {
        toCreate.push(
          this.scanTargetRepository.create({ ip, isEnabled: true }),
        );
        added.push(...resourcesForIp);
        continue;
      }

      if (!existingTarget.isEnabled) {
        existingTarget.isEnabled = true;
        await this.scanTargetRepository.save(existingTarget);
        reEnabled.push(...resourcesForIp);
      }
    }

    if (toCreate.length) {
      await this.scanTargetRepository.saveMany(toCreate);
    }

    const rejected = resolved
      .filter((item) => !item.ip)
      .map((item) => ({
        resource: item.resource,
        reason: 'Unable to resolve IPv4 or ping failed',
      }));

    return { added, reEnabled, rejected };
  }

  async toggle(
    dto: ToggleTargetDto,
  ): Promise<{ ip: string; enabled: boolean }> {
    const ip = await this.targetResolverService.resolveToIpv4(dto.resource);
    if (!ip) {
      throw new NotFoundException('Resource was not resolved to IPv4');
    }

    const target = await this.scanTargetRepository.findByIp(ip);
    if (!target) {
      throw new NotFoundException('Target is not registered');
    }

    target.isEnabled = dto.enabled;
    await this.scanTargetRepository.save(target);

    return { ip: target.ip, enabled: target.isEnabled };
  }

  async getEnabledTargetIds(): Promise<number[]> {
    const targets = await this.scanTargetRepository.findEnabledTargets();
    return targets.map((item) => item.id);
  }

  async getTargetById(id: number) {
    return this.scanTargetRepository.findById(id);
  }

  async getTargetsByIds(ids: number[]) {
    return this.scanTargetRepository.findByIds(ids);
  }

  async getTargetsByIps(ips: string[]) {
    return this.scanTargetRepository.findByIps(ips);
  }
}

