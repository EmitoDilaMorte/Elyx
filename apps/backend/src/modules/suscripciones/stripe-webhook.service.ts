import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Stripe from 'stripe';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import {
  idSuscripcionDeFactura,
  periodoDeFactura,
  periodoDeSuscripcion,
} from './stripe-campos';

/**
 * Procesa los webhooks de Stripe de forma idempotente.
 *
 * Reglas:
 *  - Cada evento se registra en `stripe_eventos` con `ON CONFLICT DO NOTHING`.
 *    Si ya existia, se responde 200 sin reprocesar (Stripe reintenta).
 *  - Nunca se propaga el error al controlador como 5xx: Stripe reintentaria
 *    indefinidamente y en bucle. Se registra y se devuelve 200.
 *  - El estado se deriva de Stripe, no del evento: si llega `created` despues
 *    de `updated`, la consulta a la API corrige el orden.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  /** `true` si el evento es nuevo y debe procesarse. */
  private async registrarEvento(evento: Stripe.Event): Promise<boolean> {
    const insertados = await this.dataSource.query(
      `
      INSERT INTO stripe_eventos (id_evento, tipo, payload)
      VALUES ($1, $2, $3)
      ON CONFLICT (id_evento) DO NOTHING
      RETURNING id_evento
      `,
      [evento.id, evento.type, JSON.stringify(evento)],
    );

    return Array.isArray(insertados) && insertados.length > 0;
  }

  async procesar(evento: Stripe.Event): Promise<{ procesado: boolean; motivo?: string }> {
    const esNuevo = await this.registrarEvento(evento);
    if (!esNuevo) {
      return { procesado: false, motivo: 'evento-duplicado' };
    }

    try {
      switch (evento.type) {
        case 'checkout.session.completed':
          await this.onCheckoutCompletado(evento);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.onSuscripcionActualizada(evento);
          break;
        case 'customer.subscription.deleted':
          await this.onSuscripcionEliminada(evento);
          break;
        case 'invoice.paid':
        case 'invoice.payment_succeeded':
          await this.onFacturaPagada(evento);
          break;
        case 'invoice.payment_failed':
          await this.onPagoFallido(evento);
          break;
        default:
          this.logger.debug(`Evento de Stripe sin manejador: ${evento.type}`);
      }

      return { procesado: true };
    } catch (error) {
      // Se registra pero se responde 200: un 5xx haria que Stripe reintente el
      // mismo evento en bucle. La reconciliacion diaria corrige lo que falle.
      this.logger.error(`Error procesando ${evento.type} (${evento.id}).`, error as Error);
      return { procesado: false, motivo: 'error-procesamiento' };
    }
  }

  // ---------------------------------------------------------------------------
  // Manejadores
  // ---------------------------------------------------------------------------

  /**
   * El checkout se completo: guarda el id de la suscripcion de Stripe y el
   * cliente. El estado ACTIVA lo marca `invoice.paid`, que llega despues.
   */
  private async onCheckoutCompletado(evento: Stripe.Event): Promise<void> {
    const session = evento.data.object as Stripe.Checkout.Session;
    const idCondominio = this.numeroDeMetadata(session.metadata, 'idCondominio');

    if (!idCondominio) {
      this.logger.warn(`Checkout ${session.id} sin idCondominio en metadata.`);
      return;
    }

    const idSuscripcionStripe =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null);

    const idCliente =
      typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);

    await this.dataSource.query(
      `
      UPDATE suscripciones_condominio
      SET id_externo = COALESCE($2, id_externo),
          proveedor_cliente_id = COALESCE($3, proveedor_cliente_id),
          proveedor = 'STRIPE',
          actualizado_en = NOW()
      WHERE id_condominio = $1
      `,
      [idCondominio, idSuscripcionStripe, idCliente],
    );
  }

  /**
   * Sincroniza estado y periodo desde la suscripcion de Stripe.
   *
   * Se consulta siempre la suscripcion completa: el objeto del evento puede
   * venir parcial o en un orden distinto al real.
   */
  private async onSuscripcionActualizada(evento: Stripe.Event): Promise<void> {
    const suscripcion = evento.data.object as Stripe.Subscription;
    const idCondominio = this.numeroDeMetadata(suscripcion.metadata, 'idCondominio');

    const estadoStripe = this.mapearEstadoStripe(suscripcion.status);
    // El periodo se lee con `periodoDeSuscripcion`: en la API actual vive en
    // cada item, no en la raiz (ver `stripe-campos.ts`).
    const { inicio, fin } = periodoDeSuscripcion(suscripcion);

    // Items de la suscripcion. El checkout los crea siempre en el mismo orden
    // (base, unidades, ajuste opcional), asi que el indice identifica cada
    // concepto. Guardarlos por separado evita el bug de cambiar la cantidad en
    // la cuota base, que multiplicaba el cargo.
    const items = suscripcion.items?.data ?? [];
    const itemBase = items[0]?.id ?? null;
    const itemUnidades = items[1]?.id ?? null;
    const itemAjuste = items[2]?.id ?? null;
    const cantidad = items[1]?.quantity ?? items[0]?.quantity ?? null;


    if (idCondominio) {
      // `$6::text` en AMBOS usos es obligatorio: si se pasa sin cast, Postgres
      // infiere `varchar(30)` por `estado = $6` y `text` por la comparacion del
      // CASE, y falla con "inconsistent types deduced for parameter $6". Ese
      // error dejaba la suscripcion en PENDIENTE aunque el cobro se hubiera
      // hecho: el webhook respondia 200 porque el error se captura arriba.
      await this.dataSource.query(
        `
        UPDATE suscripciones_condominio
        SET id_externo = $2,
            stripe_subscription_item_id = COALESCE($3, stripe_subscription_item_id),
            stripe_item_base_id = COALESCE($4, stripe_item_base_id),
            stripe_item_unidades_id = COALESCE($3, stripe_item_unidades_id),
            stripe_item_ajuste_id = $5,
            estado = $6::text,
            fecha_inicio = COALESCE($7, fecha_inicio),
            fecha_fin = COALESCE($8, fecha_fin),
            unidades_facturadas = COALESCE($9, unidades_facturadas),
            cancelar_al_final = $10,
            vencida_desde = CASE WHEN $6::text = 'ACTIVA' THEN NULL ELSE vencida_desde END,
            actualizado_en = NOW()
        WHERE id_condominio = $1
        `,
        [
          idCondominio,
          suscripcion.id,
          itemUnidades,
          itemBase,
          itemAjuste,
          estadoStripe,
          inicio,
          fin,
          cantidad,
          Boolean(suscripcion.cancel_at_period_end),
        ],
      );

      if (estadoStripe === 'ACTIVA') {
        await this.marcarCondominio(idCondominio, 'ACTIVO');
      }
    } else {
      // Sin metadata (por ejemplo suscripcion creada a mano en el Dashboard):
      // se busca por el id externo ya guardado.
      await this.dataSource.query(
        `
        UPDATE suscripciones_condominio
        SET estado = $2,
            stripe_subscription_item_id = COALESCE($3, stripe_subscription_item_id),
            stripe_item_base_id = COALESCE($4, stripe_item_base_id),
            stripe_item_unidades_id = COALESCE($3, stripe_item_unidades_id),
            stripe_item_ajuste_id = $5,
            fecha_fin = COALESCE($6, fecha_fin),
            cancelar_al_final = $7,
            actualizado_en = NOW()
        WHERE id_externo = $1
        `,
        [
          suscripcion.id,
          estadoStripe,
          itemUnidades,
          itemBase,
          itemAjuste,
          fin,
          Boolean(suscripcion.cancel_at_period_end),
        ],
      );
    }
  }

  /** La suscripcion se cancelo definitivamente: suspender el condominio. */
  private async onSuscripcionEliminada(evento: Stripe.Event): Promise<void> {
    const suscripcion = evento.data.object as Stripe.Subscription;

    const filas = await this.dataSource.query(
      `
      UPDATE suscripciones_condominio
      SET estado = 'CANCELADA', actualizado_en = NOW()
      WHERE id_externo = $1 OR id_condominio = $2
      RETURNING id_condominio
      `,
      [suscripcion.id, this.numeroDeMetadata(suscripcion.metadata, 'idCondominio') ?? 0],
    );

    for (const fila of filas as Array<Record<string, unknown>>) {
      const idCondominio = Number(fila.id_condominio);
      await this.marcarCondominio(idCondominio, 'SUSPENDIDO');
      await this.notificar(
        idCondominio,
        'SUSCRIPCION_SUSPENDIDA',
        'Suscripcion cancelada',
        'La suscripcion de Elyx fue cancelada. El condominio queda en solo lectura.',
      );
    }
  }

  /**
   * Factura pagada: activa la suscripcion y registra el pago.
   *
   * `pagos_suscripcion.monto` guarda el TOTAL cobrado (neto + IVA); el neto vive
   * en la suscripcion. Se deduplica por `(proveedor, id_externo)`.
   */
  private async onFacturaPagada(evento: Stripe.Event): Promise<void> {
    const factura = evento.data.object as Stripe.Invoice;

    const idSuscripcionStripe = idSuscripcionDeFactura(factura);

    if (!idSuscripcionStripe) {
      // El `logger.warn` es obligatorio: si Stripe vuelve a mover el campo, el
      // sintoma seria "el pago se cobro y Elyx sigue en pendiente" con
      // respuestas 200 y ninguna pista. Con esto queda en el log del backend.
      this.logger.warn(
        `Factura ${factura.id} sin suscripcion asociada. ` +
          `parent=${JSON.stringify((factura as unknown as { parent?: unknown }).parent)}. ` +
          'Se ignora el evento.',
      );
      return;
    }

    const suscripciones = await this.dataSource.query(
      `
      SELECT id_suscripcion, id_condominio
      FROM suscripciones_condominio
      WHERE id_externo = $1
      LIMIT 1
      `,
      [idSuscripcionStripe],
    );

    if (suscripciones.length === 0) {
      this.logger.warn(`Factura pagada para una suscripcion desconocida: ${idSuscripcionStripe}`);
      return;
    }

    const idSuscripcion = Number((suscripciones[0] as Record<string, unknown>).id_suscripcion);
    const idCondominio = Number((suscripciones[0] as Record<string, unknown>).id_condominio);
    const monto = (factura.amount_paid ?? 0) / 100;
    const moneda = (factura.currency ?? 'mxn').toUpperCase();

    // Periodo de SERVICIO (lo que la factura cubre), no el periodo propio de
    // la factura: en la primera factura de un checkout ambos extremos traen el
    // mismo instante y guardarlo como `fecha_fin` haria que el cron de las 3 AM
    // suspendiera una suscripcion recien pagada. Ver `stripe-campos.ts`.
    const { inicio: periodoInicio, fin: periodoFin } = periodoDeFactura(factura);

    await this.dataSource.query(
      `
      INSERT INTO pagos_suscripcion (
        id_suscripcion, proveedor, id_externo, referencia, monto, moneda,
        estado, metodo, periodo_inicio, periodo_fin, fecha, payload
      )
      VALUES ($1, 'STRIPE', $2, $3, $4, $5, 'PAGADO', 'CHECKOUT', $6, $7, NOW(), $8)
      ON CONFLICT (proveedor, id_externo) WHERE id_externo IS NOT NULL DO UPDATE
      SET periodo_inicio = COALESCE(EXCLUDED.periodo_inicio, pagos_suscripcion.periodo_inicio),
          periodo_fin = COALESCE(EXCLUDED.periodo_fin, pagos_suscripcion.periodo_fin)
      `,
      [
        idSuscripcion,
        factura.id,
        factura.number ?? factura.id,
        monto,
        moneda,
        periodoInicio,
        periodoFin,
        JSON.stringify({ idFactura: factura.id, hostedInvoiceUrl: factura.hosted_invoice_url }),
      ],
    );

    await this.dataSource.query(
      `
      UPDATE suscripciones_condominio
      SET estado = 'ACTIVA',
          fecha_fin = COALESCE($2, fecha_fin),
          vencida_desde = NULL,
          actualizado_en = NOW()
      WHERE id_suscripcion = $1
      `,
      [idSuscripcion, periodoFin],
    );

    await this.marcarCondominio(idCondominio, 'ACTIVO');
    await this.notificar(
      idCondominio,
      'SUSCRIPCION_ACTIVA',
      'Pago recibido',
      `Recibimos tu pago de $${monto.toFixed(2)} ${moneda}. La suscripcion esta activa.`,
    );
  }

  /**
   * Primer intento fallido: pasa a VENCIDA y arranca la gracia de 7 dias.
   *
   * `vencida_desde` solo se fija si estaba vacio: los reintentos de Stripe
   * (dia 3) no reinician el contador.
   */
  private async onPagoFallido(evento: Stripe.Event): Promise<void> {
    const factura = evento.data.object as Stripe.Invoice;

    const idSuscripcionStripe = idSuscripcionDeFactura(factura);

    if (!idSuscripcionStripe) {
      this.logger.warn(
        `Factura impaga ${factura.id} sin suscripcion asociada. Se ignora el evento.`,
      );
      return;
    }

    const suscripciones = await this.dataSource.query(
      `
      SELECT id_suscripcion, id_condominio
      FROM suscripciones_condominio
      WHERE id_externo = $1
      LIMIT 1
      `,
      [idSuscripcionStripe],
    );

    if (suscripciones.length === 0) {
      return;
    }

    const idSuscripcion = Number((suscripciones[0] as Record<string, unknown>).id_suscripcion);
    const idCondominio = Number((suscripciones[0] as Record<string, unknown>).id_condominio);

    await this.dataSource.query(
      `
      INSERT INTO pagos_suscripcion (
        id_suscripcion, proveedor, id_externo, referencia, monto, moneda,
        estado, metodo, fecha, payload
      )
      VALUES ($1, 'STRIPE', $2, $3, $4, 'MXN', 'FALLIDO', 'CHECKOUT', NOW(), $5)
      ON CONFLICT (proveedor, id_externo) WHERE id_externo IS NOT NULL DO NOTHING
      `,
      [
        idSuscripcion,
        `${factura.id}-fallido`,
        factura.number ?? factura.id,
        (factura.amount_due ?? 0) / 100,
        JSON.stringify({ idFactura: factura.id }),
      ],
    );

    await this.dataSource.query(
      `
      UPDATE suscripciones_condominio
      SET estado = 'VENCIDA',
          vencida_desde = COALESCE(vencida_desde, NOW()),
          actualizado_en = NOW()
      WHERE id_suscripcion = $1
      `,
      [idSuscripcion],
    );

    const dias = Number(process.env.SUSCRIPCION_DIAS_GRACIA ?? 7);
    await this.notificar(
      idCondominio,
      'SUSCRIPCION_PAGO_FALLIDO',
      'No pudimos procesar tu pago',
      `El cargo de la suscripcion fallo. Tienes ${dias} dias para actualizar tu metodo de pago antes de que el condominio pase a solo lectura.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapearEstadoStripe(
    estado: Stripe.Subscription.Status,
  ): 'PENDIENTE' | 'ACTIVA' | 'VENCIDA' | 'CANCELADA' {
    switch (estado) {
      case 'active':
      case 'trialing':
        return 'ACTIVA';
      case 'past_due':
      case 'unpaid':
        return 'VENCIDA';
      case 'canceled':
      case 'incomplete_expired':
        return 'CANCELADA';
      default:
        return 'PENDIENTE';
    }
  }

  private async marcarCondominio(idCondominio: number, estado: string): Promise<void> {
    if (!Number.isInteger(idCondominio) || idCondominio <= 0) {
      return;
    }
    await this.dataSource.query(
      `UPDATE condominios SET estado = $2 WHERE id_condominio = $1`,
      [idCondominio, estado],
    );
  }

  private async notificar(
    idCondominio: number,
    tipo: string,
    asunto: string,
    mensaje: string,
  ): Promise<void> {
    if (!Number.isInteger(idCondominio) || idCondominio <= 0) {
      return;
    }

    const admins = await this.dataSource.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
      `,
      [idCondominio],
    );

    for (const admin of admins as Array<Record<string, unknown>>) {
      const idUsuarioCondominio = Number(admin.id_usuario_condominio);
      await this.dataSource.query(
        `
        INSERT INTO notificaciones (
          tipo, canal, asunto, mensaje, fecha_programada, fecha_envio, estado,
          id_usuario_condominio, id_config
        )
        VALUES ($1, 'INTERNA', $2, $3, NOW(), NOW(), 'ENVIADA', $4, NULL)
        `,
        [tipo, asunto, mensaje, idUsuarioCondominio],
      );

      this.notificacionesGateway.emitNotificacionChanged(idCondominio, idUsuarioCondominio, {
        tipo,
      });
    }
  }

  private numeroDeMetadata(
    metadata: Stripe.Metadata | null | undefined,
    clave: string,
  ): number | null {
    const valor = metadata?.[clave];
    if (!valor) {
      return null;
    }
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
  }
}
