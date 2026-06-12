import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { ScanService } from '@modules/scan/scan.service';
import { GetCurrentStateDto } from '@modules/scan/dto/get-current-state.dto';

@ApiTags('Scan')
@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get('state')
  @ApiOperation({ summary: 'Get scan state', description: 'Returns the current scan state with port snapshots, service versions, and matched CVEs. Supports pagination, date range filtering, and IP filtering.' })
  @ApiOkResponse({
    description: 'Current scan state',
    schema: {
      example: {
        page: 1,
        limit: 20,
        totalIps: 3,
        ips: [
          {
            ip: '192.168.1.1',
            ports: [
              {
                port: 80,
                version: 'Apache httpd 2.4.51',
                cves: [
                  { cve: 'CVE-2023-1234', description: 'Remote code execution vulnerability' },
                ],
              },
              {
                port: 22,
                version: 'OpenSSH 8.9p1',
                cves: [],
              },
            ],
            createdAt: '2025-06-01T12:00:00.000Z',
          },
        ],
      },
    },
  })
  async getCurrentState(@Query() dto: GetCurrentStateDto) {
    return this.scanService.getCurrentState(dto);
  }
}
