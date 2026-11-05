import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import {
  ajustePiso,
  calcularDesglose,
  leerParametrosPrecio,
  type DesglosePrecio,
} from '../precio-suscripcion';
import { StripeClientService } from '../stripe-client.service';
import {
  CobroSuscripcion,
  DatosCobro,
  EstadoCobroProveedor,
  SuscripcionProvider,
} from './suscripcion-provider.interface';

/**
 * Cobro de la suscripcion a Elyx con Stripe.
 *
 * Usa **Checkout Sessions** en modo suscripcion con `ui_mode: 'embedded'`:
 * el checkout se monta dentro de la pagina de Elyx. Stripe Link aparece
 * automaticamente como metodo de pago (es una cartera que Stripe activa en el
 * Dashboard; no se integra por codigo).
 *
 * IVA: se aplica un Tax Rate explicito con `tax_behavior: 'exclusive'` para que
 * el cliente vea `neto + 16%`. El monto que se guarda en `suscripciones_condominio`
 * es NETO; el total cobrado vive en `pagos_suscripcion`.
 */
@Injectable()
export class StripeSuscripcionProvider implements SuscripcionProvider {
  readonly nombre = 'STRIPE';

  private readonly logger = new Logger(StripeSuscripcionProvider.name);

  constructor(private readonly stripeClient: StripeClientService) {}

  get disponible(): boolean {
    return this.stripeClient.disponible;
  }

  async crearCobro(datos: DatosCobro): Promise<CobroSuscripcion> {
    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      throw new Error(
        'Stripe no esta configurado (STRIPE_SECRET_KEY vacia). Usa SUSCRIPCION_PROVIDER=MANUAL.',
      );
    }

    const parametros = leerParametrosPrecio();
    const desglose = calcularDesglose(datos.unidades ?? 1, parametros);
    const taxRateId = await this.stripeClient.obtenerTaxRateId();

    if (!taxRateId) {
      // Cobrar sin IVA seria un cargo incorrecto en Mexico. Mejor fallar con un
      // mensaje accionable que el administrador pueda escalar.
      throw new Error(
        'No hay Tax Rate de IVA configurado. Define STRIPE_TAX_RATE_ID o revisa los permisos de la clave de Stripe.',
      );
    }

    const customer = await this.resolverCliente(stripe, datos);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // Stripe v23 renombro el valor a `embedded_page`; `embedded` responde 400.
      ui_mode: 'embedded_page' as Stripe.Checkout.SessionCreateParams.UiMode,
      customer,
      // En modo embebido `return_url` debe incluir el placeholder: Stripe lo
      // sustituye por el id de la sesion al volver.
      return_url: `${this.baseUrl()}/suscripcion?checkout=ok&session_id={CHECKOUT_SESSION_ID}`,
      locale: 'es',
      line_items: await this.items(datos, desglose),
      subscription_data: {
        default_tax_rates: [taxRateId],
        metadata: this.metadata(datos),
      },
      metadata: this.metadata(datos),
      client_reference_id: datos.referenciaSugerida,
      // Recolecta el correo del administrador si Stripe aun no lo tiene.
      ...(datos.correoAdmin ? { customer_update: { address: 'auto' as const } } : {}),
    });

    if (!session.client_secret) {
      throw new Error('Stripe no devolvio client_secret para el checkout embebido.');
    }

    return {
      referencia: datos.referenciaSugerida,
      instrucciones:
        'Completa el pago en el formulario. Puedes pagar con tarjeta o con Link (Stripe guarda tus datos para futuras compras).',
      monto: desglose.neto,
      moneda: desglose.moneda,
      urlCheckout: session.url ?? null,
      modo: 'EMBEDDED',
      clientSecret: session.client_secret,
      desglose,
    };
  }

  async consultarEstado(referencia: string): Promise<EstadoCobroProveedor> {
    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      return 'PENDIENTE';
    }

    try {
      // La referencia interna vive en `client_reference_id` del checkout.
      // Se recorren varias paginas: con `limit: 1` solo se miraba la sesion mas
      // reciente, asi que cualquier otro condominio quedaba PENDIENTE para
      // siempre.
      let startingAfter: string | undefined;
      for (let pagina = 0; pagina < 5; pagina += 1) {
        const sesiones = await stripe.checkout.sessions.list({
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        const sesion = sesiones.data.find((item) => item.client_reference_id === referencia);
        if (sesion) {
          if (sesion.status === 'complete') {
            return 'PAGADO';
          }
          if (sesion.status === 'expired') {
            return 'FALLIDO';
          }
          return 'PENDIENTE';
        }

        if (!sesiones.has_more || sesiones.data.length === 0) {
          break;
        }
        startingAfter = sesiones.data[sesiones.data.length - 1].id;
      }

      return 'PENDIENTE';
    } catch (error) {
      this.logger.error('No fue posible consultar el estado en Stripe.', error as Error);
      return 'PENDIENTE';
    }
  }

  async cancelar(referencia: string): Promise<void> {
    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      return;
    }

    // `referencia` aqui es el id de la suscripcion en Stripe (`sub_...`).
    if (!referencia.startsWith('sub_')) {
      this.logger.warn(`Cancelacion ignorada: "${referencia}" no es una suscripcion de Stripe.`);
      return;
    }

    try {
      // Al final del periodo: el cliente conserva lo que ya pago.
      await stripe.subscriptions.update(referencia, { cancel_at_period_end: true });
    } catch (error) {
      this.logger.error(`No fue posible cancelar la suscripcion ${referencia}.`, error as Error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Reutiliza el cliente de Stripe si ya existe; si no, lo crea con el correo
   * del administrador para que pueda recuperar sus compras en Link.
   */
  private async resolverCliente(stripe: Stripe, datos: DatosCobro): Promise<string> {
    if (datos.idClienteExterno) {
      return datos.idClienteExterno;
    }

    const customer = await stripe.customers.create({
      email: datos.correoAdmin || undefined,
      name: datos.nombreCondominio,
      metadata: this.metadata(datos),
    });

    return customer.id;
  }

  /**
   * Construye las lineas del checkout para que sumen EXACTAMENTE el neto del
   * desglose.
   *
   * El modelo de precio es `max(piso, base + unidad x unidades)`. Ese `max` no
   * se puede expresar con dos lineas, asi que cuando el piso aplica se agrega
   * una tercera linea de ajuste. Sin ella Stripe cobraria base + unidades
   * (p. ej. 235) mientras la app muestra 250: el cliente pagaria de menos y la
   * factura no cuadraria con la suscripcion guardada.
   */
  private async items(
    datos: DatosCobro,
    desglose: DesglosePrecio,
  ): Promise<Stripe.Checkout.SessionCreateParams.LineItem[]> {
    const lineas: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      this.itemBase(datos.moneda),
      this.itemUnidades(datos, desglose),
    ];

    const ajuste = ajustePiso(desglose);
    if (ajuste > 0) {
      lineas.push({
        quantity: 1,
        price_data: {
          currency: desglose.moneda.toLowerCase(),
          unit_amount: Math.round(ajuste * 100),
          recurring: { interval: 'month' },
          tax_behavior: 'exclusive',
          product_data: {
            name: 'Elyx — ajuste a cuota minima',
            description: 'Complemento para alcanzar la cuota mensual minima de la plataforma',
          },
        },
      });
    }

    return lineas;
  }

  /**
   * Primer `line_item`: cuota base fija.
   *
   * Si hay `STRIPE_PRICE_BASE` se usa el precio del Dashboard (recomendado en
   * produccion, permite cambiarlo sin desplegar). Si no, se crea al vuelo con
   * `price_data`; en ese caso el precio queda congelado en la suscripcion.
   */
  private itemBase(moneda: string): Stripe.Checkout.SessionCreateParams.LineItem {
    const priceId = (process.env.STRIPE_PRICE_BASE ?? '').trim();
    const parametros = leerParametrosPrecio();

    if (priceId) {
      return { price: priceId, quantity: 1 };
    }

    return {
      quantity: 1,
      price_data: {
        currency: moneda.toLowerCase(),
        unit_amount: Math.round(parametros.precioBase * 100),
        recurring: { interval: 'month' },
        tax_behavior: 'exclusive',
        product_data: {
          name: 'Elyx — cuota base',
          description: 'Suscripcion mensual a la plataforma Elyx',
        },
      },
    };
  }

  /**
   * Segundo `line_item`: costo por unidad contratada.
   *
   * La cantidad es el numero de unidades, de modo que el precio escala solo.
   * Mantener base y unidad como items separados permite que el administrador
   * vea el desglose en la factura de Stripe.
   */
  private itemUnidades(
    datos: DatosCobro,
    desglose: DesglosePrecio,
  ): Stripe.Checkout.SessionCreateParams.LineItem {
    const priceId = (process.env.STRIPE_PRICE_UNIDAD ?? '').trim();
    const parametros = leerParametrosPrecio();
    const cantidad = Math.max(desglose.unidades, 1);

    if (priceId) {
      return { price: priceId, quantity: cantidad };
    }

    return {
      quantity: cantidad,
      price_data: {
        currency: datos.moneda.toLowerCase(),
        unit_amount: Math.round(parametros.precioUnidad * 100),
        recurring: { interval: 'month' },
        tax_behavior: 'exclusive',
        product_data: {
          name: 'Elyx — unidad adicional',
          description: 'Costo mensual por unidad registrada en el condominio',
        },
      },
    };
  }

  private metadata(datos: DatosCobro): Stripe.MetadataParam {
    return {
      idCondominio: String(datos.idCondominio),
      ...(datos.idSuscripcion ? { idSuscripcion: String(datos.idSuscripcion) } : {}),
      referencia: datos.referenciaSugerida,
      unidades: String(datos.unidades ?? 1),
    };
  }

  private baseUrl(): string {
    return (
      process.env.PUBLIC_APP_URL ??
      process.env.FRONTEND_URL ??
      'http://localhost:5173'
    ).replace(/\/+$/, '');
  }
}
