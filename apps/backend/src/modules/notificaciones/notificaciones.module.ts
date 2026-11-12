import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesGateway } from './notificaciones.gateway';
import { NotificacionesService } from './notificaciones.service';

@Module({
	controllers: [NotificacionesController],
	providers: [NotificacionesService, NotificacionesGateway],
	// `NotificacionesService` lo usan otros modulos (cobros) para avisar de un
	// pago confirmado sin pasar por el controlador.
	exports: [NotificacionesService, NotificacionesGateway],
})
export class NotificacionesModule {}

