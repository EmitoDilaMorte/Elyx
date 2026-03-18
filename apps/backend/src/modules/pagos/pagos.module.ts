import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';

@Module({
	imports: [CuotasModule],
	controllers: [PagosController],
	providers: [PagosService],
})
export class PagosModule {}

