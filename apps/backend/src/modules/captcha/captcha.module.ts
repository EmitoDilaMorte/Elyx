import { Module } from '@nestjs/common';
import { CaptchaController } from './captcha.controller';
import { CaptchaService } from './captcha.service';
import { MathCaptchaGuard } from './math-captcha.guard';

@Module({
  controllers: [CaptchaController],
  providers: [CaptchaService, MathCaptchaGuard],
  exports: [CaptchaService, MathCaptchaGuard],
})
export class CaptchaModule {}
