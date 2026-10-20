import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CaptchaService } from './captcha.service';

@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Get('challenge')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  crear(@Query('scope') scope?: string) {
    return this.captchaService.crear((scope ?? 'general').slice(0, 32));
  }
}
