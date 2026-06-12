import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { AddTargetsDto } from './dto/add-targets.dto';
import { ToggleTargetDto } from './dto/toggle-target.dto';
import { TargetsService } from './targets.service';
import { AddTargetsResult } from './targets.service';
import { ScanTargetEntity } from './types/entities/scan-target.entity';

@ApiTags('Targets')
@Controller('targets')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Get()
  @ApiOperation({ summary: 'List all targets', description: 'Returns all registered scan targets' })
  @ApiOkResponse({
    description: 'List of targets',
    type: ScanTargetEntity,
    isArray: true,
  })
  async getAll(): Promise<ScanTargetEntity[]> {
    return this.targetsService.getAll();
  }

  @Post()
  @ApiOperation({ summary: 'Add scan targets', description: 'Adds new IP addresses or domain names as scan targets. Resources are resolved to IPv4, pinged for reachability, and registered for periodic scanning.' })
  @ApiCreatedResponse({
    description: 'Targets added successfully',
    schema: {
      example: {
        added: ['192.168.1.1', '10.0.0.5'],
        reEnabled: ['192.168.1.2'],
        rejected: [
          { resource: 'invalid.local', reason: 'Unable to resolve IPv4 or ping failed' },
        ],
      },
    },
  })
  async addTargets(@Body() dto: AddTargetsDto): Promise<AddTargetsResult> {
    return this.targetsService.addTargets(dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all targets', description: 'Deletes all registered scan targets and their associated scan data' })
  @ApiOkResponse({
    description: 'Targets cleared',
    schema: {
      example: { deleted: 2 },
    },
  })
  async clearAll() {
    return this.targetsService.clearAll();
  }

  @Patch('toggle')
  @ApiOperation({ summary: 'Toggle target', description: 'Enables or disables a registered scan target by IP or domain name' })
  @ApiOkResponse({
    description: 'Target state toggled',
    schema: {
      example: { ip: '192.168.1.1', enabled: false },
    },
  })
  async toggle(@Body() dto: ToggleTargetDto) {
    return this.targetsService.toggle(dto);
  }
}
