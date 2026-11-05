import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import type Stripe from 'stripe';
import { SkipCsrf } from '../../common/csrf/skip-csrf.decorator';
import { StripeClientService } from './stripe-client.service';
import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Endpoint publico de webhooks de Stripe.
 *
 * Es publico a proposito: Stripe no tiene cookies ni token CSRF. La
 * autenticidad se prueba con la **firma** del payload, no con la sesion, por
 * eso lleva `@SkipCsrf()` y `@SkipThrottle()` (Stripe puede enviar rafagas).
 *
 * Nunca responde 5xx por un fallo de negocio: Stripe reintentaria el mismo
 * evento en bucle. Un 400 solo se devuelve cuando la firma no valida.
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeClient: StripeClientService,
    private readonly webhookService: StripeWebhookService,
  ) {}

  @Post()
  @HttpCode(200)
  @SkipCsrf()
  @SkipThrottle()
  async recibir(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') firma: string | undefined,
  ) {
    const secreto = this.stripeClient.webhookSecret;

    if (!secreto) {
      // Sin secreto no se puede verificar: procesar el payload a ciegas
      // permitiria a cualquiera marcar una suscripcion como pagada.
      this.logger.error(
        'Webhook recibido pero STRIPE_WEBHOOK_SECRET no esta configurado (rechazado).',
      );
      throw new BadRequestException('Webhook no configurado.');
    }

    if (!firma) {
      throw new BadRequestException('Falta la cabecera stripe-signature.');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      // Ocurre si se olvida `rawBody: true` en NestFactory.create.
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
      this.logger.warn(`Firma de webhook invalida: ${(error as Error).message}`);
      throw new BadRequestException('Firma del webhook invalida.');
    }

    const resultado = await this.webhookService.procesar(evento);

    return {
      received: true,
      id: evento.id,
      type: evento.type,
      procesado: resultado.procesado,
      ...(resultado.motivo ? { motivo: resultado.motivo } : {}),
    };
  }
}
