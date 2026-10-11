import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class AppController {
  // El health check se consulta con frecuencia (monitoreo/contenedores) y no
  // debe consumir la cuota de rate limiting.
  @SkipThrottle()
  @Get()
  health() {
    return {
      service: 'elyx-backend',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
