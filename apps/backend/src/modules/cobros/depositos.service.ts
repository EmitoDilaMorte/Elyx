import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import type Stripe from 'stripe';
import { StripeClientService } from '../suscripciones/stripe-client.service';
import type { DepositoCondominio, EstadoDeposito } from './cobros.types';

/** Estados que Stripe reporta en un Payout y que admite la tabla. */
const ESTADOS_VALIDOS: ReadonlySet<string> = new Set([
  'pending',
  'in_transit',
  'paid',
  'failed',
  'canceled',
]);

/**
 * Depositos (payouts) que Stripe hace al condominio.
 *
 * **Por que existe este servicio**: con `dashboard: 'none'` el condominio NO
 * tiene ningun panel de Stripe donde ver cuanto y cuando le depositaron. Sin
 * esto, el administrador tendria que revisar su estado de cuenta bancario y
 * adivinar que movimientos corresponden a cuotas cobradas con tarjeta.
 *
 * **De donde salen los datos**:
 *  1. Webhook de Connect (`payout.created|updated|paid|failed|
 *     reconciliation_completed`). Es el camino normal y llega en segundos.
 *  2. Reconciliacion diaria contra `payouts.list`. Red de seguridad para
 *     eventos perdidos (endpoint caido, secreto rotado, despliegue a medias).
 *
 * **Lo que NO hace**: no toca el dinero. Los payouts los ejecuta Stripe sobre
 * la cuenta conectada; aqui solo se replica el estado para mostrarlo.
 */
@Injectable()
export class DepositosService {
  private readonly logger = new Logger(DepositosService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stripeClient: StripeClientService,
  ) {}

  private get stripe(): Stripe | null {
    return this.stripeClient.cliente;
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  /**
   * Registra o actualiza un payout que llego por webhook.
   *
   * Idempotente por `stripe_payout_id`: `payout.created`, `payout.updated` y
   * `payout.paid` del MISMO deposito llegan como eventos distintos y deben
   * dejar una sola fila con el estado mas reciente, no tres.
   */
  async registrarDesdeWebhook(
    payout: Stripe.Payout,
    stripeAccountId: string,
  ): Promise<{ procesado: boolean; motivo?: string }> {
    const estado = String(payout.status);
    if (!ESTADOS_VALIDOS.has(estado)) {
      // Un estado nuevo de Stripe no debe romper el webhook: se ignora y la
      // reconciliacion diaria volvera a intentarlo con el valor que traiga.
      this.logger.warn(`Payout ${payout.id} con estado desconocido: ${estado}`);
      return { procesado: false, motivo: 'estado-desconocido' };
    }

    const idCondominio = await this.condominioDeCuenta(stripeAccountId);
    if (!idCondominio) {
      // El evento viene de una cuenta que Elyx no conoce (cuenta creada a mano
      // en el Dashboard de Stripe). No hay a quien mostrarselo.
      this.logger.warn(
        `Payout ${payout.id} de la cuenta ${stripeAccountId}, que no pertenece a ningun condominio.`,
      );
      return { procesado: false, motivo: 'cuenta-desconocida' };
    }

    await this.guardar(idCondominio, payout);
    return { procesado: true };
  }

  // ---------------------------------------------------------------------------
  // Consulta
  // ---------------------------------------------------------------------------

  /** Depositos del condominio, del mas reciente al mas antiguo. */
  async listar(idCondominio: number, limite = 50): Promise<DepositoCondominio[]> {
    const rows = await this.dataSource.query(
      `
      SELECT id_deposito, id_condominio, stripe_payout_id, monto, moneda, estado,
             metodo, tipo, llega_en, creado_en, actualizado_en
      FROM depositos_condominio
      WHERE id_condominio = $1
      ORDER BY COALESCE(llega_en, creado_en::date) DESC, id_deposito DESC
      LIMIT $2
      `,
      [idCondominio, Math.min(Math.max(limite, 1), 200)],
    );

    if (!Array.isArray(rows)) {
      return [];
    }

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      idDeposito: Number(row.id_deposito),
      idCondominio: Number(row.id_condominio),
      stripePayoutId: String(row.stripe_payout_id),
      monto: Number(row.monto),
      moneda: String(row.moneda ?? 'MXN'),
      estado: String(row.estado) as EstadoDeposito,
      metodo: row.metodo ? String(row.metodo) : null,
      tipo: row.tipo ? String(row.tipo) : null,
      llegaEn: row.llega_en ? this.soloFecha(row.llega_en) : null,
      creadoEn: row.creado_en ? new Date(String(row.creado_en)).toISOString() : null,
      actualizadoEn: row.actualizado_en
        ? new Date(String(row.actualizado_en)).toISOString()
        : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Reconciliacion
  // ---------------------------------------------------------------------------

  /**
   * Compara la base contra los payouts reales de Stripe.
   *
   * Se pide la primera pagina (100 movimientos). Es suficiente: un condominio
   * que tuviera mas de 100 depositos sin registrar tendria un problema mucho
   * mayor que este, y el webhook ya cubre el caso normal.
   */
  async reconciliar(
    idCondominio: number,
  ): Promise<{ revisados: number; creados: number; actualizados: number; error?: string }> {
    const stripe = this.stripe;
    if (!stripe) {
      return { revisados: 0, creados: 0, actualizados: 0, error: 'stripe-no-configurado' };
    }

    const cuenta = await this.cuentaDeCondominio(idCondominio);
    if (!cuenta) {
      return { revisados: 0, creados: 0, actualizados: 0, error: 'sin-cuenta-connect' };
    }

    let payouts: Stripe.ApiList<Stripe.Payout>;
    try {
      // La cuenta conectada va en las OPCIONES. Ponerla como primer argumento
      // falla con `parameter_unknown`.
      payouts = await stripe.payouts.list({ limit: 100 }, { stripeAccount: cuenta });
    } catch (error) {
      const mensaje = (error as Error).message;
      this.logger.warn(`No se pudieron listar los payouts del condominio ${idCondominio}: ${mensaje}`);
      return { revisados: 0, creados: 0, actualizados: 0, error: mensaje };
    }

    let creados = 0;
    let actualizados = 0;
    for (const payout of payouts.data) {
      if (!ESTADOS_VALIDOS.has(String(payout.status))) {
        continue;
      }
      const resultado = await this.guardar(idCondominio, payout);
      if (resultado === 'creado') {
        creados += 1;
      } else if (resultado === 'actualizado') {
        actualizados += 1;
      }
    }

    if (creados > 0 || actualizados > 0) {
      this.logger.log(
        `Depositos del condominio ${idCondominio} reconciliados: ${creados} nuevos, ` +
          `${actualizados} actualizados de ${payouts.data.length} revisados.`,
      );
    }

    return { revisados: payouts.data.length, creados, actualizados };
  }

  /**
   * Red de seguridad diaria.
   *
   * Si el webhook no esta configurado con los eventos `payout.*` (es un cambio
   * manual en el Dashboard de Stripe), este cron es la UNICA forma en que los
   * depositos llegan a Elyx.
   *
   * A las 6:15 para no chocar con los crons de suscripciones (2 a 5 AM).
   */
  @Cron('0 15 6 * * *', { name: 'reconciliarDepositos' })
  async reconciliarTodos(): Promise<void> {
    const rows = await this.dataSource.query(
      `
      SELECT id_condominio
      FROM cuentas_cobro_condominio
      WHERE stripe_account_id IS NOT NULL
      ORDER BY id_condominio
      `,
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }

    for (const row of rows as Array<Record<string, unknown>>) {
      const idCondominio = Number(row.id_condominio);
      try {
        await this.reconciliar(idCondominio);
      } catch (error) {
        // Un condominio con problemas no debe impedir reconciliar a los demas.
        this.logger.error(
          `Fallo la reconciliacion de depositos del condominio ${idCondominio}.`,
          error as Error,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Inserta o actualiza la fila del payout.
   *
   * Devuelve `'creado'` o `'actualizado'` para poder reportar en la
   * reconciliacion. Se compara con `xmax = 0`, el truco estandar de Postgres
   * para distinguir un INSERT de un UPDATE dentro de un `ON CONFLICT`.
   */
  private async guardar(
    idCondominio: number,
    payout: Stripe.Payout,
  ): Promise<'creado' | 'actualizado' | 'sin-cambio'> {
    // `amount` viene en la unidad minima de la moneda (centavos).
    const monto = Math.round(Number(payout.amount ?? 0)) / 100;

    // `arrival_date` es epoch en SEGUNDOS; el tipo `date` de Postgres necesita
    // una fecha, no un timestamp: se envia como ISO corto.
    const llegaEn = payout.arrival_date
      ? new Date(Number(payout.arrival_date) * 1000).toISOString().slice(0, 10)
      : null;

    const rows = await this.dataSource.query(
      `
      INSERT INTO depositos_condominio (
        id_condominio, stripe_payout_id, monto, moneda, estado, metodo, tipo, llega_en
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_payout_id) DO UPDATE
      SET monto = EXCLUDED.monto,
          moneda = EXCLUDED.moneda,
          estado = EXCLUDED.estado,
          metodo = EXCLUDED.metodo,
          tipo = EXCLUDED.tipo,
          llega_en = EXCLUDED.llega_en,
          actualizado_en = NOW()
      WHERE depositos_condominio.monto IS DISTINCT FROM EXCLUDED.monto
         OR depositos_condominio.estado IS DISTINCT FROM EXCLUDED.estado
         OR depositos_condominio.llega_en IS DISTINCT FROM EXCLUDED.llega_en
         OR depositos_condominio.metodo IS DISTINCT FROM EXCLUDED.metodo
         OR depositos_condominio.tipo IS DISTINCT FROM EXCLUDED.tipo
      RETURNING (xmax = 0) AS insertado
      `,
      [
        idCondominio,
        payout.id,
        monto,
        String(payout.currency ?? 'mxn').toUpperCase(),
        String(payout.status),
        payout.method ? String(payout.method) : null,
        payout.type ? String(payout.type) : null,
        llegaEn,
      ],
    );

    const filas = this.filasDe(rows);
    if (filas.length === 0) {
      // El WHERE del DO UPDATE no se cumplio: la fila ya estaba igual.
      return 'sin-cambio';
    }

    return filas[0].insertado === true || filas[0].insertado === 't'
      ? 'creado'
      : 'actualizado';
  }

  /** Condominio dueno de una cuenta conectada. */
  private async condominioDeCuenta(stripeAccountId: string): Promise<number | null> {
    const rows = await this.dataSource.query(
      `
      SELECT id_condominio
      FROM cuentas_cobro_condominio
      WHERE stripe_account_id = $1
      LIMIT 1
      `,
      [stripeAccountId],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    return Number((rows[0] as Record<string, unknown>).id_condominio);
  }

  /** Cuenta conectada del condominio. */
  private async cuentaDeCondominio(idCondominio: number): Promise<string | null> {
    const rows = await this.dataSource.query(
      `
      SELECT stripe_account_id
      FROM cuentas_cobro_condominio
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    const cuenta = (rows[0] as Record<string, unknown>).stripe_account_id;
    return cuenta ? String(cuenta) : null;
  }

  /**
   * `date` de Postgres llega como `Date` con la medianoche UTC. Convertirlo con
   * `toISOString()` daria el dia correcto, pero si el driver lo devuelve como
   * string (`2026-11-20`) se devuelve tal cual para no correrlo un dia.
   */
  private soloFecha(valor: unknown): string {
    if (valor instanceof Date) {
      return valor.toISOString().slice(0, 10);
    }
    return String(valor).slice(0, 10);
  }

  /** Normaliza `[filas, conteo]` de TypeORM a solo filas. */
  private filasDe(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) {
      return [];
    }
    if (raw.length > 0 && Array.isArray(raw[0])) {
      return (raw[0] as Array<Record<string, unknown>>) ?? [];
    }
    return raw as Array<Record<string, unknown>>;
  }
}
