import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosGateway } from './pagos.gateway';
import { PagosService } from './pagos.service';

@Module({
	controllers: [PagosController],
	providers: [PagosService, PagosGateway],
})
export class PagosModule {}

