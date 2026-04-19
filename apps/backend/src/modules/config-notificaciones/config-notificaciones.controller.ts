import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UpsertConfigNotificacionDto } from './dto/upsert-config-notificacion.dto';
import { ConfigNotificacionesService } from './config-notificaciones.service';

@Controller('config-notificaciones')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class ConfigNotificacionesController {
  constructor(private readonly configNotificacionesService: ConfigNotificacionesService) {}

  @Get()
  getByUsuario(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idUsuarioCondominio', ParseIntPipe) idUsuarioCondominio: number,
  ) {
    return this.configNotificacionesService.getByUsuario(idCondominio, idUsuarioCondominio);
  }

  @Post('guardar')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  upsert(@Body() dto: UpsertConfigNotificacionDto) {
    return this.configNotificacionesService.upsert(dto);
  }
}
