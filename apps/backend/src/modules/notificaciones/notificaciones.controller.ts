import { Body, Controller, Get, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CreateNotificacionDto, MarcarNotificacionLeidaDto } from './dto/create-notificacion.dto';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  list(
    @Query('idCondominio', ParseIntPipe) idCondominio: number,
    @Query('idUsuarioCondominio', ParseIntPipe) idUsuarioCondominio: number,
    @Query('estado') estado?: string,
  ) {
    return this.notificacionesService.listByCondominio(idCondominio, idUsuarioCondominio, estado);
  }

  @Post('programar')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  create(@Body() dto: CreateNotificacionDto) {
    return this.notificacionesService.create(dto);
  }

  @Patch('leer')
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  marcarLeida(@Body() dto: MarcarNotificacionLeidaDto) {
    return this.notificacionesService.marcarLeida(dto);
  }
}
