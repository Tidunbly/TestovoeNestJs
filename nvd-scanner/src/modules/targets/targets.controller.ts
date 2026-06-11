import { Body, Controller, Patch, Post } from '@nestjs/common';
import { AddTargetsDto } from './dto/add-targets.dto';
import { ToggleTargetDto } from './dto/toggle-target.dto';
import { TargetsService } from './targets.service';
import { AddTargetsResult } from './targets.service';

@Controller('targets')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  async addTargets(@Body() dto: AddTargetsDto): Promise<AddTargetsResult> {
    return this.targetsService.addTargets(dto);
  }

  @Patch('toggle')
  async toggle(@Body() dto: ToggleTargetDto) {
    return this.targetsService.toggle(dto);
  }
}
