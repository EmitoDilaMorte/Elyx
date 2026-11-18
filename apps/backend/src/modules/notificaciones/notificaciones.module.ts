import { Module } from '@nestjs/common';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesDespachadorService } from './notificaciones-despachador.service';
import { NotificacionesGateway } from './notificaciones.gateway';
import { NotificacionesService } from './notificaciones.service';
import { PushService } from './push.service';
import { RecordatoriosCuotasService } from './recordatorios-cuotas.service';

@Module({
	controllers: [NotificacionesController],
	providers: [
		NotificacionesService,
		NotificacionesGateway,
		// Envio real por correo y push. El despachador corre cada minuto y el
		// de recordatorios una vez al dia; ambos son crons, no endpoints.
		PushService,
		NotificacionesDespachadorService,
		RecordatoriosCuotasService,
	],
	// `NotificacionesService` lo usan otros modulos (cobros, altas, invitaciones)
	// para avisar de un evento sin pasar por el controlador.
	exports: [NotificacionesService, NotificacionesGateway, PushService],
})
export class NotificacionesModule {}

