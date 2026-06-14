import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

@Injectable()
export class TargetResolverService {
  async resolveToIpv4(resource: string): Promise<string | null> {
    const trimmed = resource.trim();
    if (!trimmed) {
      return null;
    }

    if (isIP(trimmed) === 4) {
      return trimmed;
    }

    return this.resolveDomainWithNslookup(trimmed);
  }

  private async resolveDomainWithNslookup(
    domain: string,
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('nslookup', [domain], {
        windowsHide: true,
      });
      return this.extractDomainIpv4FromNslookup(stdout);
    } catch {
      return null;
    }
  }

  private extractDomainIpv4FromNslookup(output: string): string | null {
    const lines = output.split(/\r?\n/).map((line) => line.trim());
    const nameLineIndex = lines.findIndex((line) => /^name\s*:/i.test(line));
    const ipv4Regex = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/g;

    if (nameLineIndex !== -1) {
      for (let i = nameLineIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) {
          continue;
        }

        if (/^(server|non-authoritative answer|authoritative answers)\s*:/i.test(line)) {
          break;
        }

        if (
          /^addresses?(?:\s+\d+)?\s*:/i.test(line) ||
          /^(?:\d{1,3}\.){3}\d{1,3}$/.test(line)
        ) {
          const matches = line.match(ipv4Regex) ?? [];
          for (const candidate of matches) {
            if (isIP(candidate) === 4) {
              return candidate;
            }
          }
        }
      }
    }

    const allMatches = output.match(ipv4Regex) ?? [];
    for (let i = allMatches.length - 1; i >= 0; i -= 1) {
      const candidate = allMatches[i];
      if (isIP(candidate) === 4) {
        return candidate;
      }
    }

    return null;
  }
}
