import { Module } from '@nestjs/common';
import { CondominioAltaModule } from '../condominio-alta/condominio-alta.module';
import { CupoModule } from '../cupo/cupo.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CondominosController } from './condominos.controller';
import { CondominosService } from './condominos.service';

@Module({
	imports: [NotificacionesModule, CondominioAltaModule, CupoModule],
	controllers: [CondominosController],
	providers: [CondominosService],
})
export class CondominosModule {}

