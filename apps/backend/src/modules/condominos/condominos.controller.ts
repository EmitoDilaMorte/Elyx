import { Body, Controller, Get, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CondominosService } from './condominos.service';
import { CreateSolicitudCambioDto, ResolverSolicitudCambioDto } from './dto/create-solicitud-cambio.dto';

type AuthRequest = {
  user?: {
    sub?: number;
    memberships?: Array<{ idUsuarioCondominio: number; idCondominio: number; rol: string }>;
  };
};

@Controller('condominos')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class CondominosController {
  constructor(private readonly condominosService: CondominosService) {}

  @Post('solicitudes-cambio')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO)
  createSolicitud(@Req() req: AuthRequest, @Body() dto: CreateSolicitudCambioDto) {
    return this.condominosService.createSolicitud(dto, {
      idUsuario: Number(req.user?.sub),
      memberships: req.user?.memberships ?? [],
    });
  }

  @Get('solicitudes-cambio')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  listSolicitudes(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('estado') estado?: string,
  ) {
    return this.condominosService.listSolicitudes(idCondominio, estado);
  }

  @Patch('solicitudes-cambio/aprobar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  aprobarSolicitud(@Body() dto: ResolverSolicitudCambioDto) {
    return this.condominosService.aprobarSolicitud(dto);
  }

  @Patch('solicitudes-cambio/rechazar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  rechazarSolicitud(@Body() dto: ResolverSolicitudCambioDto) {
    return this.condominosService.rechazarSolicitud(dto);
  }

  @Patch('solicitudes-cambio/ejecutar')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  ejecutarSolicitud(@Body() dto: ResolverSolicitudCambioDto) {
    return this.condominosService.ejecutarSolicitud(dto);
  }
}
