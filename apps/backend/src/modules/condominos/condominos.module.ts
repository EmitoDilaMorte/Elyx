import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CondominosController } from './condominos.controller';
import { CondominosService } from './condominos.service';

@Module({
	imports: [NotificacionesModule],
	controllers: [CondominosController],
	providers: [CondominosService],
})
export class CondominosModule {}

