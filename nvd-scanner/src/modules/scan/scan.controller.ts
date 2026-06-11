import { Controller, Get, Query } from '@nestjs/common';
import { ScanService } from '@modules/scan/scan.service';
import { GetCurrentStateDto } from '@modules/scan/dto/get-current-state.dto';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get('state')
  async getCurrentState(@Query() dto: GetCurrentStateDto) {
    return this.scanService.getCurrentState(dto);
  }
}
