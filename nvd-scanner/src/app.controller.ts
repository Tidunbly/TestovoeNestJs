import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';

@ApiTags('App')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Returns a simple greeting to verify the API is running' })
  @ApiOkResponse({ description: 'Hello World message', type: String })
  getHello(): string {
    return 'Hello World!';
  }
}