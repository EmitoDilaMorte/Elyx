import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Stripe from 'stripe';
import { StripeClientService } from '../suscripciones/stripe-client.service';

/**
 * Cuenta conectada v2 tal como la ve el administrador.
 *
 * No se expone el objeto crudo de Stripe: solo lo que la UI necesita para
 * decidir si puede cobrar y que le falta.
 */
export type EstadoCuentaConnect = {
  tieneCuenta: boolean;
  stripeAccountId: string | null;
  /** `active` = puede cobrar. `restricted`/`pending` = falta informacion. */
  estadoCapacidad: 'active' | 'restricted' | 'pending' | 'unknown' | 'sin-cuenta';
  puedeCobrar: boolean;
  /** Requisitos que Stripe pide y aun no se cumplen. */
  requisitosPendientes: string[];
  /** Mensaje accionable cuando no puede cobrar. */
  motivo: string | null;
  /** `true` si la cuenta existe y solo falta completar el onboarding. */
  puedeContinuarOnboarding: boolean;
  conectadoEn: string | null;
  dashboard: string | null;
};

/**
 * Stripe Connect con Accounts v2 para el cobro de cuotas.
 *
 * Modelo elegido (verificado contra la cuenta de prueba del proyecto):
 *  - `dashboard: 'full'`  -> el condominio tiene su propio panel de Stripe.
 *  - `fees_collector: 'stripe'`   -> Stripe le cobra SU comision al condominio.
 *  - `losses_collector: 'stripe'` -> Elyx NO absorbe contrapesos ni saldos
 *    negativos. Elyx no es intermediario: el dinero nunca pasa por su balance.
 *
 * Las cuentas son v2 (`stripe.v2.core.accounts`), que es la API que Stripe
 * recomienda para integraciones nuevas; los tipos Standard/Express/Custom
 * estan marcados como obsoletos.
 *
 * Con `dashboard: 'full'` Stripe hace el KYC y la recoleccion de requisitos,
 * por eso `requirements_collector` resulta `stripe` automaticamente.
 */
@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeClient: StripeClientService,
  ) {}

  private get stripe(): Stripe | null {
    return this.stripeClient.cliente;
  }

  /** `true` cuando hay credenciales de Stripe configuradas. */
  get disponible(): boolean {
    return this.stripeClient.disponible;
  }

  // ---------------------------------------------------------------------------
  // Creacion de la cuenta
  // ---------------------------------------------------------------------------

  /**
   * Crea la cuenta conectada del condominio, o devuelve la que ya existe.
   *
   * Idempotente a proposito: el administrador puede pulsar "Conectar" varias
   * veces sin generar cuentas duplicadas en Stripe.
   */
  async crearOReutilizarCuenta(idCondominio: number): Promise<EstadoCuentaConnect> {
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException(
        'Stripe no esta configurado en esta instancia. Usa transferencia SPEI.',
      );
    }

    const datos = await this.datosCondominio(idCondominio);

    // Ya existe: no se crea otra, se devuelve su estado real.
    if (datos.stripeAccountId) {
      return this.consultarEstado(idCondominio);
    }

    const cuenta = await stripe.v2.core.accounts.create({
      display_name: datos.nombre,
      ...(datos.correoAdmin ? { contact_email: datos.correoAdmin } : {}),
      identity: {
        country: 'mx',
        entity_type: 'company',
        business_details: {
          registered_name: datos.razonSocial ?? datos.nombre,
        },
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
      },
      defaults: {
        currency: 'mxn',
        // `es-MX` NO es un enum valido en Stripe; para LatAm es `es-419`.
        locales: ['es-419'],
        responsibilities: {
          // Stripe cobra sus comisiones directamente al condominio...
          fees_collector: 'stripe',
          // ...y absorbe los saldos negativos. Elyx queda fuera de la ecuacion.
          losses_collector: 'stripe',
        },
      },
      dashboard: 'full',
      metadata: { idCondominio: String(idCondominio) },
      include: ['configuration.merchant', 'identity', 'defaults', 'requirements'],
    });

    await this.guardarCuenta(idCondominio, cuenta);

    this.logger.log(
      `Cuenta Connect v2 creada para el condominio ${idCondominio}: ${cuenta.id}`,
    );

    return this.consultarEstado(idCondominio);
  }

  /**
   * Genera el enlace de onboarding hospedado por Stripe.
   *
   * El administrador completa ahi el RFC, la cuenta bancaria y la verificacion
   * de identidad. Elyx nunca ve esos datos: los recoge Stripe directamente.
   */
  async crearEnlaceOnboarding(idCondominio: number): Promise<{ url: string }> {
    const stripe = this.stripe;
    if (!stripe) {
      throw new BadRequestException(
        'Stripe no esta configurado en esta instancia. Usa transferencia SPEI.',
      );
    }

    const estado = await this.crearOReutilizarCuenta(idCondominio);
    if (!estado.stripeAccountId) {
      throw new BadRequestException('No fue posible crear la cuenta de Stripe del condominio.');
    }

    const base = this.baseUrl();

    // En v2 la forma cambio: todo va dentro de `use_case`, no en la raiz.
    const enlace = await stripe.v2.core.accountLinks.create({
      account: estado.stripeAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          refresh_url: `${base}/connect/refresh?idCondominio=${idCondominio}`,
          return_url: `${base}/connect/return?idCondominio=${idCondominio}`,
          // `eventually_due` pide todo de una vez en lugar de ir por partes:
          // para un tramite unico es menos frustrante que tres rondas.
          collection_options: { fields: 'eventually_due' },
        },
      },
    });

    return { url: enlace.url };
  }

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  /**
   * Estado real de la cuenta consultado a Stripe.
   *
   * Se consulta en vivo en lugar de confiar en la copia local: los requisitos
   * de Stripe cambian sin avisar (una verificacion que caduca, un documento
   * nuevo) y una copia vieja diria "puede cobrar" cuando ya no.
   */
  async consultarEstado(idCondominio: number): Promise<EstadoCuentaConnect> {
    const datos = await this.datosCondominio(idCondominio);

    if (!datos.stripeAccountId) {
      return {
        tieneCuenta: false,
        stripeAccountId: null,
        estadoCapacidad: 'sin-cuenta',
        puedeCobrar: false,
        requisitosPendientes: [],
        motivo: 'El condominio aun no conecto su cuenta de Stripe.',
        puedeContinuarOnboarding: true,
        conectadoEn: null,
        dashboard: null,
      };
    }

    const stripe = this.stripe;
    if (!stripe) {
      return {
        tieneCuenta: true,
        stripeAccountId: datos.stripeAccountId,
        estadoCapacidad: 'unknown',
        puedeCobrar: datos.stripeChargesEnabled,
        requisitosPendientes: [],
        motivo: 'Stripe no esta configurado en esta instancia.',
        puedeContinuarOnboarding: false,
        conectadoEn: datos.stripeConectadoEn,
        dashboard: null,
      };
    }

    try {
      const cuenta = await stripe.v2.core.accounts.retrieve(datos.stripeAccountId, {
        include: ['configuration.merchant', 'requirements', 'defaults'],
      });

      const capacidad = cuenta.configuration?.merchant?.capabilities?.card_payments;
      const estadoCapacidad = this.mapearCapacidad(capacidad?.status);
      const puedeCobrar = estadoCapacidad === 'active';
      const requisitos = this.requisitosPendientes(cuenta);

      // Se sincroniza la copia local: `puedeCobrar` es lo que consulta el
      // cobro para decidir si ofrece tarjeta.
      await this.actualizarCapacidadLocal(idCondominio, puedeCobrar);

      return {
        tieneCuenta: true,
        stripeAccountId: datos.stripeAccountId,
        estadoCapacidad,
        puedeCobrar,
        requisitosPendientes: requisitos,
        motivo: puedeCobrar
          ? null
          : requisitos.length > 0
            ? `Stripe pide mas informacion para activar los cobros: ${requisitos.slice(0, 4).join(', ')}.`
            : 'Stripe aun esta verificando la cuenta. Suele tardar unos minutos.',
        puedeContinuarOnboarding: !puedeCobrar,
        conectadoEn: datos.stripeConectadoEn,
        dashboard: cuenta.dashboard ? String(cuenta.dashboard) : null,
      };
    } catch (error) {
      this.logger.warn(
        `No fue posible consultar la cuenta ${datos.stripeAccountId}: ${(error as Error).message}`,
      );
      return {
        tieneCuenta: true,
        stripeAccountId: datos.stripeAccountId,
        estadoCapacidad: 'unknown',
        puedeCobrar: datos.stripeChargesEnabled,
        requisitosPendientes: [],
        motivo: 'No fue posible consultar el estado en Stripe. Intenta de nuevo en un momento.',
        puedeContinuarOnboarding: true,
        conectadoEn: datos.stripeConectadoEn,
        dashboard: null,
      };
    }
  }

  /** Sincroniza el estado de la cuenta desde un evento de Stripe. */
  async sincronizarDesdeStripe(stripeAccountId: string, puedeCobrar: boolean): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuentas_cobro_condominio
      SET stripe_charges_enabled = $2, actualizado_en = NOW()
      WHERE stripe_account_id = $1
      `,
      [stripeAccountId, puedeCobrar],
    );
  }

  /** `true` si el condominio tiene una cuenta que puede cobrar con tarjeta. */
  async puedeCobrarConTarjeta(idCondominio: number): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      SELECT stripe_account_id, stripe_charges_enabled
      FROM cuentas_cobro_condominio
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      return false;
    }
    const row = rows[0] as Record<string, unknown>;
    return Boolean(row.stripe_account_id) && Boolean(row.stripe_charges_enabled);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async datosCondominio(idCondominio: number): Promise<{
    nombre: string;
    razonSocial: string | null;
    rfc: string | null;
    correoAdmin: string | null;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    stripeConectadoEn: string | null;
  }> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.nombre,
        c.razon_social,
        c.rfc,
        cc.stripe_account_id,
        cc.stripe_charges_enabled,
        cc.stripe_conectado_en,
        (SELECT u.correo FROM usuarios_condominios uc
          JOIN usuarios u ON u.id_usuario = uc.id_usuario
          WHERE uc.id_condominio = c.id_condominio AND uc.rol = 'ADMINISTRADOR'
          ORDER BY uc.id_usuario_condominio LIMIT 1) AS correo_admin
      FROM condominios c
      LEFT JOIN cuentas_cobro_condominio cc ON cc.id_condominio = c.id_condominio
      WHERE c.id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      nombre: String(row.nombre ?? ''),
      razonSocial: row.razon_social ? String(row.razon_social) : null,
      rfc: row.rfc ? String(row.rfc) : null,
      correoAdmin: row.correo_admin ? String(row.correo_admin) : null,
      stripeAccountId: row.stripe_account_id ? String(row.stripe_account_id) : null,
      stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
      stripeConectadoEn: row.stripe_conectado_en
        ? new Date(String(row.stripe_conectado_en)).toISOString()
        : null,
    };
  }

  private async guardarCuenta(idCondominio: number, cuenta: { id: string }): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO cuentas_cobro_condominio (
        id_condominio, metodo, stripe_account_id, stripe_charges_enabled, stripe_conectado_en
      )
      VALUES ($1, 'STRIPE_CONNECT', $2, FALSE, NOW())
      ON CONFLICT (id_condominio) DO UPDATE SET
        metodo = 'STRIPE_CONNECT',
        stripe_account_id = $2,
        stripe_conectado_en = COALESCE(cuentas_cobro_condominio.stripe_conectado_en, NOW()),
        actualizado_en = NOW()
      `,
      [idCondominio, cuenta.id],
    );
  }

  private async actualizarCapacidadLocal(
    idCondominio: number,
    puedeCobrar: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuentas_cobro_condominio
      SET stripe_charges_enabled = $2, actualizado_en = NOW()
      WHERE id_condominio = $1 AND stripe_charges_enabled IS DISTINCT FROM $2
      `,
      [idCondominio, puedeCobrar],
    );
  }

  private mapearCapacidad(
    estado: string | undefined,
  ): 'active' | 'restricted' | 'pending' | 'unknown' {
    if (estado === 'active') return 'active';
    if (estado === 'restricted') return 'restricted';
    if (estado === 'pending') return 'pending';
    return 'unknown';
  }

  /**
   * Requisitos que Stripe marca como vencidos o pendientes.
   *
   * En v2 los requisitos viven en un arreglo unico (`requirements.entries`) y
   * cada uno lleva su propio `minimum_deadline.status`, a diferencia de v1 que
   * tenia listas separadas (`currently_due`, `past_due`, `eventually_due`).
   * El nombre legible esta en `description`; no existe un campo `requirement`.
   *
   * `eventually_due` se omite a proposito: son requisitos futuros que no
   * bloquean el cobro hoy, y mostrarlos asustaria sin motivo.
   */
  private requisitosPendientes(cuenta: {
    requirements?: {
      entries?: Array<{
        description?: string;
        minimum_deadline?: { status?: string };
      }>;
    };
  }): string[] {
    const entradas = cuenta.requirements?.entries ?? [];
    return entradas
      .filter((entrada) => {
        const estado = entrada.minimum_deadline?.status;
        return estado === 'past_due' || estado === 'currently_due';
      })
      .map((entrada) => String(entrada.description ?? ''))
      .filter((nombre) => nombre.length > 0);
  }

  private baseUrl(): string {
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .trim()
      .replace(/\/+$/, '');
    return base.length > 0 ? base : 'http://localhost:5173';
  }
}
