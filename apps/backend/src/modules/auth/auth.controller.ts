import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { extractClientIp, TurnstileGuard } from '../../common/turnstile/turnstile.guard';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

type AuthRequest = {
  user?: {
    sub?: number;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(TurnstileGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  login(@Req() req: Request, @Body() dto: LoginDto) {
    return this.authService.login(dto, extractClientIp(req));
  }

  @Post('forgot-password')
  @UseGuards(TurnstileGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(TurnstileGuard)
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
