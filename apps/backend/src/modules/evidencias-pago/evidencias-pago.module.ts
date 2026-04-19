import { Module } from '@nestjs/common';
import { EvidenciasPagoController } from './evidencias-pago.controller';
import { EvidenciasPagoGateway } from './evidencias-pago.gateway';
import { EvidenciasPagoService } from './evidencias-pago.service';

@Module({
	controllers: [EvidenciasPagoController],
	providers: [EvidenciasPagoService, EvidenciasPagoGateway],
})
export class EvidenciasPagoModule {}

