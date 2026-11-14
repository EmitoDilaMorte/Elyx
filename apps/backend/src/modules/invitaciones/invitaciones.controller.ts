import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
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
import { ResolverSolicitudAltaDto } from './dto/invitaciones.dto';
import { InvitacionesService } from './invitaciones.service';

type AuthRequest = { user?: { sub?: number } };

/** Panel del administrador: gestionar el enlace y aprobar solicitudes. */
@Controller('invitaciones')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class InvitacionesController {
  constructor(private readonly invitacionesService: InvitacionesService) {}

  // `ParseIntPipe` en los query params: sin el, un `idCondominio` ausente o no
  // numerico llegaba como NaN hasta el SQL y respondia 500. El cliente merece
  // un 400 que diga que falta el parametro.
  @Get()
  estado(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.invitacionesService.estado(idCondominio);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  crear(@Query('idCondominio', ParseIntPipe) idCondominio: number, @Req() req: AuthRequest) {
    // El actor se toma del JWT: nunca de un id enviado por el cliente.
    return this.invitacionesService.crearOrotar(
      idCondominio,
      Number(req.user?.sub ?? 0),
    );
  }

  @Patch('revocar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  revocar(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.invitacionesService.revocar(idCondominio);
  }

  @Get('solicitudes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR, Role.SUPERUSER)
  solicitudes(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('estado') estado?: string,
  ) {
    return this.invitacionesService.listarSolicitudes(idCondominio, estado);
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
