import { Module } from '@nestjs/common';
import { FotosMantenimientoController } from './fotos-mantenimiento.controller';
import { FotosMantenimientoService } from './fotos-mantenimiento.service';
import { ReportesMantenimientoGateway } from '../reportes-mantenimiento/reportes-mantenimiento.gateway';

@Module({
  controllers: [FotosMantenimientoController],
  providers: [FotosMantenimientoService, ReportesMantenimientoGateway],
})
export class FotosMantenimientoModule {}
