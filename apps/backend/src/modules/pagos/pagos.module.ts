import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { PagosController } from './pagos.controller';
import { PagosGateway } from './pagos.gateway';
import { PagosService } from './pagos.service';

@Module({
	imports: [CuotasModule],
	controllers: [PagosController],
	providers: [PagosService, PagosGateway],
	exports: [PagosService, PagosGateway],
})
export class PagosModule {}

