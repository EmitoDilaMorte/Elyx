import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

type AuthRequest = {
  user?: {
    sub?: number;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
