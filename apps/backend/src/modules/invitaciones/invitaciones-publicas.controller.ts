import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { extractClientIp, TurnstileGuard } from '../../common/turnstile/turnstile.guard';
import {
  ConfirmarSolicitudDto,
  CrearSolicitudInvitacionDto,
} from './dto/invitaciones.dto';
import { InvitacionesService } from './invitaciones.service';

/**
 * Flujo publico del enlace de invitacion.
 *
 * Nunca expone ids de usuarios ni datos de otros condominos: solo el nombre del
 * condominio y las unidades libres.
 */
@Controller('invitaciones/publica')
export class InvitacionesPublicasController {
  constructor(private readonly invitacionesService: InvitacionesService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  obtener(@Param('token') token: string) {
    return this.invitacionesService.obtenerPublica(token);
  }

  @Post(':token/solicitud')
  @UseGuards(TurnstileGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  crearSolicitud(
    @Param('token') token: string,
    @Req() req: Request,
    @Body() dto: CrearSolicitudInvitacionDto,
  ) {
    const headers = (req as unknown as { headers: Record<string, string | string[] | undefined> })
      .headers;
    const userAgent = headers['user-agent'];
    return this.invitacionesService.crearSolicitud(token, dto, {
      ip: extractClientIp(req as unknown as Record<string, any>),
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }

  @Post('confirmar')
  @UseGuards(TurnstileGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  confirmar(@Body() dto: ConfirmarSolicitudDto) {
    return this.invitacionesService.confirmarSolicitud(dto.token);
  }
}
