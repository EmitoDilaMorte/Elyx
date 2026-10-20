import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { REFRESH_COOKIE } from '../../common/auth/session-cookies';
import { extractClientIp, TurnstileGuard } from '../../common/turnstile/turnstile.guard';
import { MathCaptcha } from '../captcha/math-captcha.decorator';
import { MathCaptchaGuard } from '../captcha/math-captcha.guard';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { MfaEnableDto } from './dto/mfa-enable.dto';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaResendDto } from './dto/mfa-resend.dto';
import type { MfaMetodo } from './mfa.service';

type AuthRequest = {
  user?: {
    sub?: number;
  };
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
};

function metaDe(req: AuthRequest) {
  const userAgent = req.headers['user-agent'];
  return {
    ip: extractClientIp(req as unknown as Record<string, any>),
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(TurnstileGuard, MathCaptchaGuard)
  @MathCaptcha('after_failures')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LoginDto,
  ) {
    const resultado = await this.authService.login(
      dto,
      extractClientIp(req),
      res,
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    );

    if ('mfaRequired' in resultado) {
      res.status(202);
      return resultado;
    }

    if (resultado.behavior) {
      res.setHeader('X-Behavior-Score', String(resultado.behavior.score));
    }

    return resultado;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.authService.refrescar(req.cookies?.[REFRESH_COOKIE], res, metaDe(req));
  }

  @Post('logout')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.authService.cerrarSesion(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verificarMfa(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response, @Body() dto: MfaVerifyDto) {
    return this.authService.verificarMfa(
      dto.challengeId,
      dto.codigo,
      (dto.metodo ?? 'TOTP') as MfaMetodo,
      res,
      metaDe(req),
    );
  }

  @Post('mfa/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  reenviarMfa(@Body() dto: MfaResendDto) {
    return this.authService.reenviarMfa(dto.challengeId);
  }

  @Get('mfa/estado')
  @UseGuards(JwtAuthGuard)
  estadoMfa(@Req() req: AuthRequest) {
    return this.authService.estadoMfa(Number(req.user?.sub));
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  iniciarMfa(@Req() req: AuthRequest) {
    return this.authService.iniciarAltaMfa(Number(req.user?.sub));
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  activarMfa(@Req() req: AuthRequest, @Body() dto: MfaEnableDto) {
    return this.authService.activarMfa(Number(req.user?.sub), dto.codigo, dto.canal ?? 'TOTP');
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  desactivarMfa(@Req() req: AuthRequest, @Body() dto: MfaCodeDto) {
    return this.authService.desactivarMfa(Number(req.user?.sub), dto.codigo);
  }

  @Post('forgot-password')
  @UseGuards(TurnstileGuard, MathCaptchaGuard)
  @MathCaptcha('always')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(TurnstileGuard, MathCaptchaGuard)
  @MathCaptcha('always')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('validate-reset-token')
  validateResetToken(@Body() dto: ValidateResetTokenDto) {
    return this.authService.validateResetToken(dto);
  }

  @Patch('perfil')
  @UseGuards(JwtAuthGuard)
  updatePerfil(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfileCorreo(Number(req.user?.sub), dto.correo);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(Number(req.user?.sub), dto.passwordActual, dto.passwordNueva);
  }
}
