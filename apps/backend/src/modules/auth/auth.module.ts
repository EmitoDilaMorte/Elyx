import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { TurnstileModule } from '../../common/turnstile/turnstile.module';

@Module({
  imports: [JwtModule.register({}), TurnstileModule],
  controllers: [AuthController],
  providers: [AuthService, LoginAttemptsService, JwtAuthGuard, CondominioAccessGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, CondominioAccessGuard, RolesGuard],
})
export class AuthModule {}
