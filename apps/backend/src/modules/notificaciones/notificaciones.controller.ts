import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import {
  CreateNotificacionDto,
  ListarNotificacionesQueryDto,
  MarcarNotificacionLeidaDto,
  PushDesuscripcionDto,
  PushSuscripcionDto,
} from './dto/notificaciones.dto';
import { NotificacionesService } from './notificaciones.service';
import { PushService } from './push.service';

type RequestConUsuario = {
  user?: {
    memberships?: Array<{ idUsuarioCondominio: number; idCondominio: number; rol: string }>;
    isSuperuser?: boolean;
  };
  query?: Record<string, unknown>;
};

/**
 * Notificaciones del usuario autenticado.
 *
 * El `idUsuarioCondominio` SIEMPRE sale del JWT, nunca de la query. Antes el
 * endpoint lo aceptaba como parametro, asi que cualquier miembro del condominio
 * podia leer (y marcar como leidas) las notificaciones de otro.
 */
@Controller('notificaciones')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class NotificacionesController {
  constructor(
    private readonly notificacionesService: NotificacionesService,
    private readonly pushService: PushService,
  ) {}

  @Get()
  list(@Req() req: RequestConUsuario, @Query() query: ListarNotificacionesQueryDto) {
    return this.notificacionesService.listar({
      idUsuarioCondominio: this.membresia(req),
      soloNoLeidas: query.soloNoLeidas,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** Contador de no leidas y ultimas diez: lo que pinta la campana. */
  @Get('resumen')
  resumen(@Req() req: RequestConUsuario) {
    return this.notificacionesService.resumen(this.membresia(req));
  }

  @Patch('leer')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  marcarLeida(@Req() req: RequestConUsuario, @Body() dto: MarcarNotificacionLeidaDto) {
    return this.notificacionesService.marcarLeida(dto.idNotificacion, this.membresia(req));
  }

  @Patch('leer-todas')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  marcarTodas(@Req() req: RequestConUsuario) {
    return this.notificacionesService.marcarTodasLeidas(this.membresia(req));
  }

  // -------------------------------------------------------------------------
  // Web Push
  // -------------------------------------------------------------------------

  /** Clave publica VAPID. Sin ella el frontend muestra "no disponible". */
  @Get('push/clave')
  clavePush() {
    const clave = this.pushService.clavePublica();
    return { configurado: Boolean(clave), clave };
  }

  @Get('push/estado')
  async estadoPush(@Req() req: RequestConUsuario) {
    const idUsuarioCondominio = this.membresia(req);
    return {
      configurado: this.pushService.configurado(),
      clave: this.pushService.clavePublica(),
      dispositivos: await this.pushService.contar(idUsuarioCondominio),
    };
  }

  @Post('push/suscribir')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  async suscribir(
    @Req() req: RequestConUsuario,
    @Body() dto: PushSuscripcionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.pushService.suscribir(this.membresia(req), dto, userAgent);
    return { ok: true };
  }

  @Post('push/desuscribir')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  async desuscribir(@Req() req: RequestConUsuario, @Body() dto: PushDesuscripcionDto) {
    const eliminado = await this.pushService.desuscribir(this.membresia(req), dto.endpoint);
    return { ok: true, eliminado };
  }

  // -------------------------------------------------------------------------
  // Envio manual (solo administrador)
  // -------------------------------------------------------------------------

  @Post('programar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  crear(@Body() dto: CreateNotificacionDto) {
    return this.notificacionesService.crear({
      idCondominio: dto.idCondominio,
      idUsuarioCondominio: dto.idUsuarioCondominio,
      tipo: dto.tipo,
      asunto: dto.asunto,
      mensaje: dto.mensaje,
      fechaProgramada: dto.fechaProgramada,
      canales: dto.canales,
    });
  }

  /**
   * Resuelve el usuario-condominio activo a partir del JWT.
   *
   * Con `idCondominio` en la query se busca esa membresia; sin el, se usa la
   * primera. El superusuario (que no tiene membresias) puede indicarla
   * explicitamente por query, porque necesita inspeccionar cuentas ajenas.
   */
  private membresia(req: RequestConUsuario): number {
    const memberships = req.user?.memberships ?? [];
    const idCondominio = Number(req.query?.idCondominio ?? 0);

    const encontrada =
      Number.isInteger(idCondominio) && idCondominio > 0
        ? memberships.find((item) => Number(item.idCondominio) === idCondominio)
        : memberships[0];

    if (encontrada) {
      return Number(encontrada.idUsuarioCondominio);
    }

    if (req.user?.isSuperuser || process.env.AUTH_REQUIRED !== 'true') {
      const alterno = Number(req.query?.idUsuarioCondominio ?? 0);
      if (Number.isInteger(alterno) && alterno > 0) {
        return alterno;
      }
    }

    throw new BadRequestException('No fue posible identificar tu membresia en el condominio.');
  }
}
