import { Module } from '@nestjs/common';
import { CupoModule } from '../cupo/cupo.module';
import { PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';

/**
 * Pagina publica del condominio.
 *
 * Se mantiene separado de `InvitacionesModule` a proposito: la pagina existe
 * aunque no haya ninguna invitacion (es la URL que Stripe verifica), y sus
 * datos se publican sin autenticacion. Mezclarlos haria facil agregar por
 * error un campo privado a una respuesta publica.
 */
@Module({
  imports: [CupoModule],
  controllers: [PublicoController],
  providers: [PublicoService],
  exports: [PublicoService],
})
export class PublicoModule {}
