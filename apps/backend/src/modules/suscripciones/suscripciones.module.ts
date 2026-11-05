import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ManualSuscripcionProvider } from './providers/manual-suscripcion.provider';
import { NullSuscripcionProvider } from './providers/null-suscripcion.provider';
import { StripeSuscripcionProvider } from './providers/stripe-suscripcion.provider';
import { SUSCRIPCION_PROVIDER, SuscripcionProvider } from './providers/suscripcion-provider.interface';
import { StripeClientService } from './stripe-client.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesService } from './suscripciones.service';

/**
 * El proveedor se resuelve en tiempo de arranque segun `SUSCRIPCION_PROVIDER`.
 *
 * Si se pide `STRIPE` pero falta la clave, se degrada a `MANUAL` en lugar de
 * romper el arranque: asi un despliegue sin credenciales sigue funcionando y el
 * superusuario puede confirmar pagos a mano hasta que se configuren.
 */
const suscripcionProviderFactory = {
  provide: SUSCRIPCION_PROVIDER,
  useFactory: (
    manual: ManualSuscripcionProvider,
    nulo: NullSuscripcionProvider,
    stripe: StripeSuscripcionProvider,
  ): SuscripcionProvider => {
    const seleccionado = (process.env.SUSCRIPCION_PROVIDER ?? 'MANUAL').trim().toUpperCase();

    if (process.env.SUSCRIPCION_ENABLED !== 'true' || seleccionado === 'NULL') {
      return nulo;
    }

    if (seleccionado === 'STRIPE') {
      return stripe.disponible ? stripe : manual;
    }

    return manual;
  },
  inject: [ManualSuscripcionProvider, NullSuscripcionProvider, StripeSuscripcionProvider],
};

@Module({
  imports: [NotificacionesModule],
  controllers: [SuscripcionesController, StripeWebhookController],
  providers: [
    SuscripcionesService,
    StripeClientService,
    StripeWebhookService,
    ManualSuscripcionProvider,
    NullSuscripcionProvider,
    StripeSuscripcionProvider,
    suscripcionProviderFactory,
  ],
  exports: [SuscripcionesService, StripeClientService],
})
export class SuscripcionesModule {}
