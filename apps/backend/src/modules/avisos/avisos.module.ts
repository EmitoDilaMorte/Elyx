import { Module } from '@nestjs/common';
import { AvisosController } from './avisos.controller';
import { AvisosGateway } from './avisos.gateway';
import { AvisosService } from './avisos.service';

@Module({
	controllers: [AvisosController],
	providers: [AvisosService, AvisosGateway],
	exports: [AvisosGateway],
})
export class AvisosModule {}

