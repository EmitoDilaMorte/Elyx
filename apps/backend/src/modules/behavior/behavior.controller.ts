import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { extractClientIp } from '../../common/turnstile/turnstile.guard';
import { SkipCsrf } from '../../common/csrf/skip-csrf.decorator';
import { BehaviorBatchDto } from './dto/behavior-batch.dto';
import { BehaviorService } from './behavior.service';

@Controller('behavior')
export class BehaviorController {
  constructor(private readonly behaviorService: BehaviorService) {}

  @Post()
  @SkipCsrf()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  registrar(@Body() dto: BehaviorBatchDto, @Req() request: Request) {
    return this.behaviorService.registrar(dto, {
      ip: extractClientIp(request),
      userAgent: request.headers['user-agent'],
    });
  }

  @Get('session/:sessionId')
  @UseGuards(JwtAuthGuard)
  resumen(@Param('sessionId') sessionId: string) {
    return this.behaviorService.resumenSesion(sessionId.slice(0, 64));
  }
}
