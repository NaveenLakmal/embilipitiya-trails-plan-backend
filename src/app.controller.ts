import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check — returns 200 when the API is up' })
  @ApiResponse({ status: 200, description: 'API is running' })
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'embitrail-api',
    };
  }
}
