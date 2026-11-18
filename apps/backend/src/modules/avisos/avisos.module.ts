import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AvisosController } from './avisos.controller';
import { AvisosGateway } from './avisos.gateway';
import { AvisosService } from './avisos.service';

@Module({
	imports: [NotificacionesModule],
	controllers: [AvisosController],
	providers: [AvisosService, AvisosGateway],
	exports: [AvisosGateway],
})
export class AvisosModule {}

