import { Module } from '@nestjs/common';
import { CuotasController } from './cuotas.controller';
import { CuotasService } from './cuotas.service';
import { EstadoCuentaController } from './estado-cuenta.controller';

@Module({
	controllers: [CuotasController, EstadoCuentaController],
	providers: [CuotasService],
	exports: [CuotasService],
})
export class CuotasModule {}

