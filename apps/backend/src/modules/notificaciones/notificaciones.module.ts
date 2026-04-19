import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesGateway } from './notificaciones.gateway';
import { NotificacionesService } from './notificaciones.service';

@Module({
	controllers: [NotificacionesController],
	providers: [NotificacionesService, NotificacionesGateway],
	exports: [NotificacionesGateway],
})
export class NotificacionesModule {}

