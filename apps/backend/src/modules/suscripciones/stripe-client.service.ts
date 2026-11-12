import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';

/**
 * Interop de Stripe.
 *
 * El paquete exporta el constructor con `module.exports = Stripe` (CommonJS sin
 * `.default`). Como el proyecto usa `allowSyntheticDefaultImports` sin
 * `esModuleInterop`, TypeScript compila `import Stripe from 'stripe'` a
 * `stripe_1.default`, que en runtime es `undefined` ("is not a constructor").
 *
 * Se resuelve aqui, en un solo lugar, en vez de activar `esModuleInterop` en el
 * tsconfig: eso obligaria a reescribir otros `import * as` del proyecto (por
 * ejemplo `cookieParser`, que se invoca como funcion).
 */
function cargarConstructorStripe(): typeof Stripe {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const modulo = require('stripe') as unknown as { default?: typeof Stripe } & typeof Stripe;
  return (modulo.default ?? modulo) as typeof Stripe;
}

/**
 * Envoltorio del SDK de Stripe.
 *
 * El cliente se crea de forma perezosa: si `STRIPE_SECRET_KEY` esta vacia, el
 * backend sigue arrancando con `SUSCRIPCION_PROVIDER=MANUAL` o `NULL` en lugar
 * de fallar al iniciar. Eso importa para el self-hosting.
 */
@Injectable()
export class StripeClientService {
  private readonly logger = new Logger(StripeClientService.name);
  private clienteCache: Stripe | null | undefined;
  private taxRateCache: string | null | undefined;
  private productoAjusteCache: string | null | undefined;

  /** Clave secreta configurada (vacia si no hay). */
  get secretKey(): string {
    const bruta = (process.env.STRIPE_SECRET_KEY ?? '').trim();

    // Caso tipico al descomentar una linea del `.env`: queda `KEY=#sk_test_...`
    // y el `#` pasa a formar parte del valor. Ninguna clave de Stripe empieza
    // por `#`, asi que se limpia avisando en lugar de fallar con un 401 opaco.
    if (bruta.startsWith('#')) {
      const limpia = bruta.replace(/^#+\s*/, '');
      this.logger.warn(
        'STRIPE_SECRET_KEY empieza por "#": se interpreta como linea comentada en el .env. ' +
          'Se esta ignorando el prefijo; corrige el archivo para evitar esta advertencia.',
      );
      return limpia;
    }

    return bruta;
  }

  /** Secreto del endpoint de webhooks (`whsec_...`). */
  get webhookSecret(): string {
    return (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  }

  /**
   * Secreto del webhook de Connect (cobro de cuotas).
   *
   * Es distinto del de la suscripcion a proposito: Stripe separa los eventos
   * por scope y cada destino del Dashboard tiene su propio secreto. Los
   * direct charges llegan al scope "Connected accounts", no al de la cuenta
   * plataforma, y su firma se calcula con este secreto.
   */
  get webhookSecretConnect(): string {
    return (process.env.STRIPE_WEBHOOK_SECRET_CONNECT ?? '').trim();
  }

  /** `false` cuando faltan credenciales: no se puede cobrar con Stripe. */
  get disponible(): boolean {
    return this.secretKey.length > 0;
  }

  /** Cliente de Stripe, o `null` si no hay credenciales. */
  get cliente(): Stripe | null {
    if (this.clienteCache !== undefined) {
      return this.clienteCache;
    }

    if (!this.disponible) {
      this.logger.warn(
        'STRIPE_SECRET_KEY no esta configurada: los cobros con Stripe quedan deshabilitados.',
      );
      this.clienteCache = null;
      return null;
    }

    this.clienteCache = new (cargarConstructorStripe())(this.secretKey, {
      // Sin `apiVersion` explicita se usa la del SDK instalado; fijarla a mano
      // obliga a actualizarla en cada bump y no aporta nada aqui.
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: 'Elyx', version: '0.1.0' },
    });

    return this.clienteCache;
  }

  /**
   * Tax Rate del IVA (16 % por defecto) con `inclusive: false`.
   *
   * Se usa un Tax Rate explicito en lugar de `automatic_tax`: Stripe Tax no
   * cubre Mexico de forma fiable y dejaria facturas sin IVA. Si el operador no
   * define `STRIPE_TAX_RATE_ID`, se crea (o reutiliza) uno al vuelo.
   */
  async obtenerTaxRateId(): Promise<string | null> {
    if (this.taxRateCache !== undefined) {
      return this.taxRateCache;
    }

    const configurado = (process.env.STRIPE_TAX_RATE_ID ?? '').trim();
    if (configurado) {
      this.taxRateCache = configurado;
      return configurado;
    }

    const stripe = this.cliente;
    if (!stripe) {
      this.taxRateCache = null;
      return null;
    }

    const porcentaje = Number(process.env.SUSCRIPCION_IVA_PORCENTAJE ?? 16);
    const moneda = (process.env.SUSCRIPCION_MONEDA ?? 'MXN').trim().toLowerCase();
    const etiqueta = `IVA ${porcentaje}%`;

    try {
      // Reutiliza el Tax Rate si ya existe: crear uno por checkout llenaria el
      // dashboard de duplicados con el mismo porcentaje.
      const existentes = await stripe.taxRates.list({ limit: 100, active: true });
      const coincidencia = existentes.data.find(
        (tarifa) =>
          tarifa.inclusive === false &&
          Number(tarifa.percentage) === porcentaje &&
          tarifa.active,
      );

      if (coincidencia) {
        this.taxRateCache = coincidencia.id;
        return coincidencia.id;
      }

      const creado = await stripe.taxRates.create({
        display_name: etiqueta,
        description: `IVA aplicable a servicios digitales en ${moneda.toUpperCase()}`,
        percentage: porcentaje,
        inclusive: false,
        country: (process.env.STRIPE_TAX_COUNTRY ?? 'MX').toUpperCase(),
        jurisdiction: (process.env.STRIPE_TAX_COUNTRY ?? 'MX').toUpperCase(),
        tax_type: 'vat',
      });

      this.logger.log(`Tax Rate de IVA creado: ${creado.id} (${porcentaje}%)`);
      this.taxRateCache = creado.id;
      return creado.id;
    } catch (error) {
      // Sin Tax Rate se cobraria sin IVA: es preferible fallar el cobro a
      // emitir un cargo incorrecto. El llamador decide como degradar.
      this.logger.error('No fue posible obtener el Tax Rate de IVA.', error as Error);
      this.taxRateCache = null;
      return null;
    }
  }

  /**
   * Producto de la linea "ajuste a cuota minima".
   *
   * `subscriptionItems.create/update` con `price_data` exige el ID de un
   * producto ya existente (no acepta `product_data`). Se busca o crea una sola
   * vez y se reutiliza: sin la cache cada ajuste de unidades crearia un
   * producto nuevo y ensuciaria el catalogo.
   */
  async obtenerProductoAjuste(): Promise<string | null> {
    if (this.productoAjusteCache !== undefined) {
      return this.productoAjusteCache;
    }

    const stripe = this.cliente;
    if (!stripe) {
      this.productoAjusteCache = null;
      return null;
    }

    const nombre = 'Elyx — ajuste a cuota minima';

    try {
      const existentes = await stripe.products.list({ limit: 100, active: true });
      const coincidencia = existentes.data.find((producto) => producto.name === nombre);

      if (coincidencia) {
        this.productoAjusteCache = coincidencia.id;
        return coincidencia.id;
      }

      const creado = await stripe.products.create({
        name: nombre,
        description: 'Complemento para alcanzar la cuota mensual minima de la plataforma',
      });

      this.logger.log(`Producto de ajuste creado: ${creado.id}`);
      this.productoAjusteCache = creado.id;
      return creado.id;
    } catch (error) {
      this.logger.error('No fue posible obtener el producto de ajuste.', error as Error);
      this.productoAjusteCache = null;
      return null;
    }
  }

  /** Limpia la cache (util tras cambiar la clave en caliente o en pruebas). */
  reiniciar(): void {
    this.clienteCache = undefined;
    this.taxRateCache = undefined;
    this.productoAjusteCache = undefined;
  }
}
