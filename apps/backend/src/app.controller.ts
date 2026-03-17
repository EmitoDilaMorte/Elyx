import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  health() {
    return {
      service: 'elyx-backend',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
