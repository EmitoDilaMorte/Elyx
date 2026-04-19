import { Module } from '@nestjs/common';
import { ReportesMantenimientoController } from './reportes-mantenimiento.controller';
import { ReportesMantenimientoGateway } from './reportes-mantenimiento.gateway';
import { ReportesMantenimientoService } from './reportes-mantenimiento.service';

@Module({
	controllers: [ReportesMantenimientoController],
	providers: [ReportesMantenimientoService, ReportesMantenimientoGateway],
})
export class ReportesMantenimientoModule {}

