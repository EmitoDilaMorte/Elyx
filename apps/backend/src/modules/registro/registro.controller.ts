import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { extractClientIp, TurnstileGuard } from '../../common/turnstile/turnstile.guard';
import { CreateCondominioAdminDto } from './dto/create-condominio-admin.dto';
import {
  CreateRegistroCondominioDto,
  ReenviarVerificacionDto,
  VerificarRegistroQueryDto,
} from './dto/create-registro.dto';
import { RegistroService } from './registro.service';

type PublicRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: { sub?: number };
};

/**
 * Alta publica de condominios ("Crea tu condominio").
 *
 * Todo el flujo es sin sesion: la prueba de propiedad del correo es el token
 * enviado por email. Las respuestas no revelan si una cuenta ya existe.
 */
@Controller('registro')
export class RegistroController {
  constructor(private readonly registroService: RegistroService) {}

  /** Estado del flujo, para que el frontend decida si muestra el formulario. */
  @Get('disponible')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  disponible() {
    return this.registroService.disponibilidad();
  }

  @Post('condominio')
  @UseGuards(TurnstileGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  crear(@Req() req: Request, @Body() dto: CreateRegistroCondominioDto) {
    const userAgent = (req as unknown as PublicRequest).headers['user-agent'];
    return this.registroService.crearRegistro(dto, {
      ip: extractClientIp(req as unknown as Record<string, any>),
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Post('reenviar-verificacion')
  @UseGuards(TurnstileGuard)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  reenviar(@Body() dto: ReenviarVerificacionDto) {
    return this.registroService.reenviarVerificacion(dto);
  }

  @Get('verificar')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verificar(@Query() query: VerificarRegistroQueryDto) {
    return this.registroService.verificarToken(query.token);
  }

  @Get(':idRegistro/estado')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  estado(@Param('idRegistro', ParseIntPipe) idRegistro: number) {
    return this.registroService.estadoRegistro(idRegistro);
  }

  /**
   * Alta de un condominio adicional desde la sesion de un administrador.
   *
   * No pide verificacion de correo ni contrasena: la sesion ya prueba quien es.
   * Es la via recomendada cuando el correo ya tiene cuenta en Elyx.
   */
  @Post('condominio-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  crearComoAdmin(@Req() req: Request, @Body() dto: CreateCondominioAdminDto) {
    const user = (req as unknown as PublicRequest).user;
    return this.registroService.crearComoAdmin(Number(user?.sub ?? 0), dto);
  }
}
