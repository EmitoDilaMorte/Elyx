import { Body, Controller, Get, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CreateReporteMantenimientoDto,
  UpdateReporteMantenimientoEstadoDto,
} from './dto/reportes-mantenimiento.dto';
import { ReportesMantenimientoService } from './reportes-mantenimiento.service';

@Controller('reportes-mantenimiento')
export class ReportesMantenimientoController {
  constructor(private readonly reportesMantenimientoService: ReportesMantenimientoService) {}

  @Get()
  list(@Query('idCondominio', ParseIntPipe) idCondominio: number) {
    return this.reportesMantenimientoService.listByCondominio(idCondominio);
  }

  @Post()
  create(@Body() dto: CreateReporteMantenimientoDto) {
    return this.reportesMantenimientoService.create(dto);
  }

  @Patch('estado')
  updateEstado(@Body() dto: UpdateReporteMantenimientoEstadoDto) {
    return this.reportesMantenimientoService.updateEstado(dto);
  }
}