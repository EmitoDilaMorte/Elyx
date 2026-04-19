import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ConfigNotificacionesController } from './config-notificaciones.controller';
import { ConfigNotificacionesService } from './config-notificaciones.service';

@Module({
	imports: [NotificacionesModule],
	controllers: [ConfigNotificacionesController],
	providers: [ConfigNotificacionesService],
})
export class ConfigNotificacionesModule {}

