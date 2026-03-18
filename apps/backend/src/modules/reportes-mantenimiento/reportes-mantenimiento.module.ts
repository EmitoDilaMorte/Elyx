import { Module } from '@nestjs/common';
import { ReportesMantenimientoController } from './reportes-mantenimiento.controller';
import { ReportesMantenimientoService } from './reportes-mantenimiento.service';

@Module({
	controllers: [ReportesMantenimientoController],
	providers: [ReportesMantenimientoService],
})
export class ReportesMantenimientoModule {}

