import { Module } from '@nestjs/common';
import { TurnstileModule } from '../../common/turnstile/turnstile.module';
import { CondominioAltaModule } from '../condominio-alta/condominio-alta.module';
import { CupoModule } from '../cupo/cupo.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { InvitacionesPublicasController } from './invitaciones-publicas.controller';
import { InvitacionesController } from './invitaciones.controller';
import { InvitacionesService } from './invitaciones.service';

@Module({
  imports: [CondominioAltaModule, CupoModule, NotificacionesModule, TurnstileModule],
  controllers: [InvitacionesController, InvitacionesPublicasController],
  providers: [InvitacionesService],
  exports: [InvitacionesService],
})
export class InvitacionesModule {}
