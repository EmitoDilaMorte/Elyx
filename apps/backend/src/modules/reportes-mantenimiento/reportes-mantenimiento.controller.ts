import { Body, Controller, Get, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CondominioAccessGuard } from '../../common/auth/condominio-access.guard';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Role } from '../../common/auth/role.enum';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import {
  CreateReporteMantenimientoDto,
  UpdateReporteMantenimientoEstadoDto,
} from './dto/reportes-mantenimiento.dto';
import { ReportesMantenimientoService } from './reportes-mantenimiento.service';

@Controller('reportes-mantenimiento')
@UseGuards(JwtAuthGuard, CondominioAccessGuard)
export class ReportesMantenimientoController {
  constructor(private readonly reportesMantenimientoService: ReportesMantenimientoService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.reportesMantenimientoService.listByCondominio(idCondominio);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CONDOMINO, Role.ADMINISTRADOR)
  create(@Body() dto: CreateReporteMantenimientoDto) {
    return this.reportesMantenimientoService.create(dto);
  }

  @Patch('estado')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRADOR)
  updateEstado(@Body() dto: UpdateReporteMantenimientoEstadoDto) {
    return this.reportesMantenimientoService.updateEstado(dto);
  }
}