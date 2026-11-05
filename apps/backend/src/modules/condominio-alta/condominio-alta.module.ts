import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CondominioAltaService } from './condominio-alta.service';

@Module({
  imports: [NotificacionesModule],
  providers: [CondominioAltaService],
  exports: [CondominioAltaService],
})
export class CondominioAltaModule {}
