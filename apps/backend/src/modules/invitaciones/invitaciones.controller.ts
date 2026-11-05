import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ResolverSolicitudAltaDto } from './dto/invitaciones.dto';
import { InvitacionesService } from './invitaciones.service';

type AuthRequest = { user?: { sub?: number } };

/** Panel del administrador: gestionar el enlace y aprobar solicitudes. */
@Controller('invitaciones')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class InvitacionesController {
  constructor(private readonly invitacionesService: InvitacionesService) {}

  @Get()
  estado(@Query('idCondominio') idCondominio: string) {
    return this.invitacionesService.estado(Number(idCondominio));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crear(@Query('idCondominio') idCondominio: string, @Req() req: AuthRequest) {
    // El actor se toma del JWT: nunca de un id enviado por el cliente.
    return this.invitacionesService.crearOrotar(
      Number(idCondominio),
      Number(req.user?.sub ?? 0),
    );
  }

  @Patch('revocar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  revocar(@Query('idCondominio') idCondominio: string) {
    return this.invitacionesService.revocar(Number(idCondominio));
  }

  @Get('solicitudes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  solicitudes(
    @Query('idCondominio') idCondominio: string,
    @Query('estado') estado?: string,
  ) {
    return this.invitacionesService.listarSolicitudes(Number(idCondominio), estado);
  }

  @Patch('solicitudes/aprobar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  aprobar(@Body() dto: ResolverSolicitudAltaDto, @Req() req: AuthRequest) {
    return this.invitacionesService.aprobarSolicitud(dto, Number(req.user?.sub ?? 0));
  }

  @Patch('solicitudes/rechazar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  rechazar(@Body() dto: ResolverSolicitudAltaDto, @Req() req: AuthRequest) {
    return this.invitacionesService.rechazarSolicitud(dto, Number(req.user?.sub ?? 0));
  }
}
