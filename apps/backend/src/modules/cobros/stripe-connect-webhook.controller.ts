import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import type Stripe from 'stripe';
import { SkipCsrf } from '../../common/csrf/skip-csrf.decorator';
import { StripeClientService } from '../suscripciones/stripe-client.service';
import { CobrosStripeService } from './cobros-stripe.service';

/**
 * Webhook de Stripe para los cobros de cuotas (Connect).
 *
 * **Por que es un endpoint aparte del de la suscripcion**: en Stripe, los
 * eventos se separan por *scope*. Los de la suscripcion son de la cuenta
 * plataforma ("Your account"); los de un direct charge llegan en "Connected
 * accounts". Stripe exige crear un destino distinto en el Dashboard para cada
 * scope, y cada destino tiene su propio secreto de firma.
 *
 * Por eso usa `STRIPE_WEBHOOK_SECRET_CONNECT`, no `STRIPE_WEBHOOK_SECRET`.
 * Si se compartieran, la verificacion fallaria: la firma se calcula con el
 * secreto del destino que la envia.
 *
 * Es publico a proposito (Stripe no tiene cookies ni token CSRF) y lleva
 * `@SkipThrottle()` porque Stripe puede enviar rafagas. La autenticidad se
 * prueba con la firma del payload.
 */
@Controller('webhooks/stripe/connect')
export class StripeConnectWebhookController {
  private readonly logger = new Logger(StripeConnectWebhookController.name);

  constructor(
    private readonly stripeClient: StripeClientService,
    private readonly cobrosStripe: CobrosStripeService,
  ) {}

  @Post()
  @HttpCode(200)
  @SkipCsrf()
  @SkipThrottle()
  async recibir(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') firma: string | undefined,
  ) {
    const secreto = this.stripeClient.webhookSecretConnect;

    if (!secreto) {
      // Fail-closed: sin secreto no se puede verificar y procesar a ciegas
      // permitiria a cualquiera marcar una cuota como pagada.
      this.logger.error(
        'Webhook de Connect recibido pero STRIPE_WEBHOOK_SECRET_CONNECT no esta configurado (rechazado).',
      );
      throw new BadRequestException('Webhook de Connect no configurado.');
    }

    if (!firma) {
      throw new BadRequestException('Falta la cabecera stripe-signature.');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error(
        'req.rawBody no esta disponible: falta { rawBody: true } en NestFactory.create.',
      );
      throw new BadRequestException('No se pudo leer el cuerpo del webhook.');
    }

    const stripe = this.stripeClient.cliente as Stripe | null;
    if (!stripe) {
      throw new BadRequestException('Stripe no esta configurado.');
    }

    let evento: Stripe.Event;
    try {
      evento = stripe.webhooks.constructEvent(rawBody, firma, secreto);
    } catch (error) {
      this.logger.warn(`Firma invalida en webhook de Connect: ${(error as Error).message}`);
      throw new BadRequestException('Firma del webhook invalida.');
    }

    const resultado = await this.procesar(evento);

    return {
      received: true,
      id: evento.id,
      type: evento.type,
      account: evento.account ?? null,
      ...resultado,
    };
  }

  /**
   * Procesa el evento de forma idempotente.
   *
   * Nunca lanza 5xx: un error de negocio no debe hacer que Stripe reintente en
   * bucle. La reconciliacion diaria corrige lo que se pierda.
   */
  private async procesar(
    evento: Stripe.Event,
  ): Promise<{ procesado: boolean; motivo?: string }> {
    const esNuevo = await this.registrarEvento(evento);
    if (!esNuevo) {
      return { procesado: false, motivo: 'evento-duplicado' };
    }

    try {
      switch (evento.type) {
        case 'checkout.session.completed': {
          const session = evento.data.object as Stripe.Checkout.Session;
          const cuenta = this.cuentaDelEvento(evento);

          if (!cuenta) {
            this.logger.warn(
              `checkout.session.completed sin cuenta conectada (evento ${evento.id}). ` +
                'Revisa que el destino del webhook este en el scope "Connected accounts".',
            );
            return { procesado: false, motivo: 'sin-cuenta-conectada' };
          }

          return this.cobrosStripe.confirmarCargoDesdeWebhook(session, cuenta);
        }

        /**
         * OXXO, debito bancario y otros metodos asincronos.
         *
         * En `checkout.session.completed` estas sesiones llegan con
         * `payment_status: 'unpaid'` y `confirmarCargoDesdeWebhook` las rechaza
         * a proposito. El pago se confirma aqui, cuando el dinero ya entro.
         */
        case 'checkout.session.async_payment_succeeded': {
          const session = evento.data.object as Stripe.Checkout.Session;
          const cuenta = this.cuentaDelEvento(evento);

          if (!cuenta) {
            return { procesado: false, motivo: 'sin-cuenta-conectada' };
          }

          return this.cobrosStripe.confirmarCargoDesdeWebhook(session, cuenta);
        }

        /**
         * El metodo asincrono fallo o el voucher vencio sin pagarse. El cargo
         * se libera para que el condomino pueda generar uno nuevo.
         */
        case 'checkout.session.async_payment_failed': {
          const session = evento.data.object as Stripe.Checkout.Session;
          const cuenta = this.cuentaDelEvento(evento);

          if (!cuenta) {
            return { procesado: false, motivo: 'sin-cuenta-conectada' };
          }

          const liberado = await this.cobrosStripe.liberarCargoPorSesion(
            session.id,
            cuenta,
            'CANCELADO',
          );
          return {
            procesado: liberado,
            motivo: liberado ? undefined : 'cargo-no-pendiente',
          };
        }

        /**
         * La sesion caduco sin pago. Liberar el cargo es obligatorio: si se
         * quedara PENDIENTE, el indice unico impediria crear uno nuevo y la
         * cuota quedaria sin forma de pagarse en linea.
         */
        case 'checkout.session.expired': {
          const session = evento.data.object as Stripe.Checkout.Session;
          const cuenta = this.cuentaDelEvento(evento);

          if (!cuenta) {
            return { procesado: false, motivo: 'sin-cuenta-conectada' };
          }

          const liberado = await this.cobrosStripe.liberarCargoPorSesion(
            session.id,
            cuenta,
            'EXPIRADO',
          );
          return {
            procesado: liberado,
            motivo: liberado ? undefined : 'cargo-no-pendiente',
          };
        }

        case 'account.updated': {
          // La cuenta del condominio cambio de estado (verificacion completada,
          // requisito nuevo). Se sincroniza para saber si puede cobrar.
          const cuenta = evento.data.object as Stripe.Account;
          const puedeCobrar = Boolean(cuenta.charges_enabled);
          await this.sincronizarCuenta(cuenta.id, puedeCobrar);
          return { procesado: true };
        }

        default:
          this.logger.debug(`Evento de Connect sin manejador: ${evento.type}`);
          return { procesado: true };
      }
    } catch (error) {
      this.logger.error(
        `Error procesando ${evento.type} (${evento.id}).`,
        error as Error,
      );
      return { procesado: false, motivo: 'error-procesamiento' };
    }
  }

  /**
   * La cuenta conectada que origino el evento.
   *
   * `event.account` es la fuente de verdad: identifica al condominio sin
   * confiar en la metadata, que viaja en el objeto y la controla quien crea la
   * sesion. Si faltara, se cae al metadata como ultimo recurso.
   */
  private cuentaDelEvento(evento: Stripe.Event): string | null {
    if (evento.account) {
      return evento.account;
    }

    const objeto = evento.data.object as { metadata?: Record<string, string> } | undefined;
    const delMetadata = objeto?.metadata?.stripeAccountId;
    return delMetadata && delMetadata.length > 0 ? delMetadata : null;
  }

  private async registrarEvento(evento: Stripe.Event): Promise<boolean> {
    const insertados = await this.cobrosStripe.registrarEventoStripe(
      evento,
      evento.account ?? null,
    );
    return insertados;
  }

  private async sincronizarCuenta(
    stripeAccountId: string,
    puedeCobrar: boolean,
  ): Promise<void> {
    await this.cobrosStripe.sincronizarCapacidadCuenta(stripeAccountId, puedeCobrar);
  }
}
