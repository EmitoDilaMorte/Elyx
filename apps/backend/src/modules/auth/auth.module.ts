import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { RolesGuard } from '../../common/auth/roles.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, CondominioAccessGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, CondominioAccessGuard, RolesGuard],
})
export class AuthModule {}
