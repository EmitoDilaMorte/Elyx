import { Module } from '@nestjs/common';
import { CuotasModule } from '../cuotas/cuotas.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { PagosModule } from '../pagos/pagos.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { CobrosController } from './cobros.controller';
import { CobrosService } from './cobros.service';
import { CobrosStripeService } from './cobros-stripe.service';
import { ConnectService } from './connect.service';
import { DepositosService } from './depositos.service';
import { StripeConnectWebhookController } from './stripe-connect-webhook.controller';

/**
 * Cobro de cuotas del condominio (SPEI y Stripe Connect).
 *
 * `CobrosService` se exporta porque el webhook de Stripe necesita confirmar
 * cargos desde fuera de este modulo.
 *
 * `PagosModule` se importa para reutilizar `PagosGateway`: cuando un cobro se
 * confirma (webhook de Stripe o conciliacion SPEI) hay que avisar al navegador
 * del condomino y del administrador, igual que hace `PagosService.aprobar`.
 * No hay ciclo: `PagosModule` solo depende de `CuotasModule`.
 */
@Module({
  imports: [CuotasModule, NotificacionesModule, SuscripcionesModule, PagosModule],
  controllers: [CobrosController, StripeConnectWebhookController],
  providers: [CobrosService, ConnectService, CobrosStripeService, DepositosService],
  exports: [CobrosService, ConnectService, CobrosStripeService, DepositosService],
})
export class CobrosModule {}
