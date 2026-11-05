import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import {
  ConfirmarPagoSuscripcionDto,
} from './dto/suscripciones.dto';
import {
  CobroSuscripcion,
  EstadoCobroProveedor,
  SUSCRIPCION_PROVIDER,
  SuscripcionProvider,
} from './providers/suscripcion-provider.interface';
import {
  EstadoSuscripcion,
  PagoSuscripcionRecord,
  SuscripcionRecord,
} from './suscripciones.types';
import {
  ajustePiso,
  calcularDesglose,
  leerParametrosPrecio,
  type DesglosePrecio,
} from './precio-suscripcion';
import { StripeClientService } from './stripe-client.service';

type SuscripcionRow = Record<string, unknown>;

@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
    private readonly stripeClient: StripeClientService,
    @Inject(SUSCRIPCION_PROVIDER) private readonly provider: SuscripcionProvider,
  ) {}

  estaHabilitada(): boolean {
    return process.env.SUSCRIPCION_ENABLED === 'true';
  }

  /** Vista del administrador: estado de la suscripcion de su condominio. */
  async obtenerMia(idCondominio: number): Promise<SuscripcionRecord | null> {
    const rows = await this.dataSource.query(
      `
      SELECT
        s.*,
        c.nombre AS nombre_condominio,
        c.estado AS estado_condominio,
        COALESCE((
          SELECT SUM(p.monto) FROM pagos_suscripcion p
          WHERE p.id_suscripcion = s.id_suscripcion AND p.estado = 'PAGADO'
        ), 0) AS total_pagado
      FROM suscripciones_condominio s
      JOIN condominios c ON c.id_condominio = s.id_condominio
      WHERE s.id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      return null;
    }

    return this.toRecord(rows[0] as SuscripcionRow);
  }

  async listarTodas(): Promise<SuscripcionRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        s.*,
        c.nombre AS nombre_condominio,
        c.estado AS estado_condominio,
        COALESCE((
          SELECT SUM(p.monto) FROM pagos_suscripcion p
          WHERE p.id_suscripcion = s.id_suscripcion AND p.estado = 'PAGADO'
        ), 0) AS total_pagado
      FROM suscripciones_condominio s
      JOIN condominios c ON c.id_condominio = s.id_condominio
      ORDER BY
        CASE s.estado
          WHEN 'PENDIENTE' THEN 0
          WHEN 'VENCIDA' THEN 1
          WHEN 'ACTIVA' THEN 2
          ELSE 3
        END,
        s.creado_en DESC
      `,
    );

    return rows.map((row: SuscripcionRow) => this.toRecord(row));
  }

  async listarPagos(idSuscripcion: number): Promise<PagoSuscripcionRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        p.id_pago_suscripcion,
        p.referencia,
        p.monto,
        p.moneda,
        p.estado,
        p.metodo,
        p.periodo_inicio,
        p.periodo_fin,
        p.fecha,
        u.correo AS confirmado_por
      FROM pagos_suscripcion p
      LEFT JOIN usuarios u ON u.id_usuario = p.confirmado_por
      WHERE p.id_suscripcion = $1
      ORDER BY p.fecha DESC
      `,
      [idSuscripcion],
    );

    return rows.map((row: Record<string, unknown>) => ({
      idPagoSuscripcion: Number(row.id_pago_suscripcion),
      referencia: row.referencia ? String(row.referencia) : null,
      monto: Number(row.monto ?? 0),
      moneda: String(row.moneda ?? 'MXN'),
      estado: String(row.estado ?? 'PENDIENTE') as PagoSuscripcionRecord['estado'],
      metodo: String(row.metodo ?? 'MANUAL') as PagoSuscripcionRecord['metodo'],
      periodoInicio: row.periodo_inicio ? new Date(String(row.periodo_inicio)).toISOString() : null,
      periodoFin: row.periodo_fin ? new Date(String(row.periodo_fin)).toISOString() : null,
      fecha: new Date(String(row.fecha)).toISOString(),
      confirmadoPor: row.confirmado_por ? String(row.confirmado_por) : null,
    }));
  }

  /**
   * Genera (o recupera) el cobro pendiente del condominio.
   *
   * El monto se calcula con `calcularDesglose` (base + unidades, con piso) y se
   * guarda NETO en la suscripcion. El IVA viaja en el desglose y lo aplica el
   * proveedor con un Tax Rate `exclusive`.
   */
  async crearCobroPendiente(idCondominio: number): Promise<CobroSuscripcion> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_condominio,
        c.nombre,
        c.cupo_unidades,
        (SELECT COUNT(*)::int FROM unidades u
          WHERE u.id_condominio = c.id_condominio) AS unidades_reales,
        c.rfc,
        c.razon_social,
        c.regimen_fiscal,
        c.cp_fiscal,
        (SELECT u.correo FROM usuarios_condominios uc
          JOIN usuarios u ON u.id_usuario = uc.id_usuario
          WHERE uc.id_condominio = c.id_condominio AND uc.rol = 'ADMINISTRADOR'
          ORDER BY uc.id_usuario_condominio LIMIT 1) AS correo_admin,
        s.id_suscripcion,
        s.referencia_pago,
        s.moneda,
        s.periodo,
        s.proveedor_cliente_id
      FROM condominios c
      LEFT JOIN suscripciones_condominio s ON s.id_condominio = c.id_condominio
      WHERE c.id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as SuscripcionRow;
    const referencia = row.referencia_pago
      ? String(row.referencia_pago)
      : this.generarReferencia(idCondominio);
    const moneda = String(row.moneda ?? leerParametrosPrecio().moneda);
    const periodo = String(row.periodo ?? 'MENSUAL') as 'MENSUAL' | 'ANUAL';

    // Las unidades contratadas definen el precio. Si el condominio no tiene
    // cupo (creado por el superusuario, o alta sin licencia) se cobra por las
    // unidades que realmente existen: cobrar 1 seria regalar el condominio.
    const cupo = Number(row.cupo_unidades ?? 0);
    const reales = Number(row.unidades_reales ?? 0);
    const unidades = cupo > 0 ? cupo : reales > 0 ? reales : 1;
    const desglose = calcularDesglose(unidades);
    const montoNeto = desglose.neto;

    let idSuscripcion = row.id_suscripcion ? Number(row.id_suscripcion) : null;

    if (!idSuscripcion) {
      const insertados = await this.dataSource.query(
        `
        INSERT INTO suscripciones_condominio (
          id_condominio, plan, cupo_unidades, periodo, monto, moneda,
          estado, proveedor, referencia_pago,
          precio_base, precio_unidad, iva_porcentaje, unidades_facturadas
        )
        VALUES ($1, 'ESTANDAR', $2, $3, $4, $5, 'PENDIENTE', $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id_condominio) DO UPDATE SET actualizado_en = NOW()
        RETURNING id_suscripcion
        `,
        [
          idCondominio,
          row.cupo_unidades ?? null,
          periodo,
          montoNeto,
          moneda,
          this.provider.nombre,
          referencia,
          desglose.precioBase,
          desglose.precioUnidad,
          desglose.ivaPorcentaje,
          unidades,
        ],
      );

      idSuscripcion = Number((insertados[0] as Record<string, unknown>)?.id_suscripcion ?? 0) || null;
    } else {
      // Mantiene el monto al dia si cambiaron el precio o las unidades.
      await this.dataSource.query(
        `
        UPDATE suscripciones_condominio
        SET referencia_pago = COALESCE(referencia_pago, $2),
            monto = $3,
            moneda = $4,
            precio_base = $5,
            precio_unidad = $6,
            iva_porcentaje = $7,
            unidades_facturadas = $8,
            actualizado_en = NOW()
        WHERE id_suscripcion = $1
        `,
        [
          idSuscripcion,
          referencia,
          montoNeto,
          moneda,
          desglose.precioBase,
          desglose.precioUnidad,
          desglose.ivaPorcentaje,
          unidades,
        ],
      );
    }

    const cobro = await this.provider.crearCobro({
      idCondominio,
      idSuscripcion: idSuscripcion ?? undefined,
      nombreCondominio: String(row.nombre ?? ''),
      correoAdmin: String(row.correo_admin ?? ''),
      monto: montoNeto,
      moneda,
      periodo,
      referenciaSugerida: referencia,
      unidades,
      idClienteExterno: row.proveedor_cliente_id ? String(row.proveedor_cliente_id) : null,
      datosFiscales: {
        rfc: row.rfc ? String(row.rfc) : null,
        razonSocial: row.razon_social ? String(row.razon_social) : null,
        regimenFiscal: row.regimen_fiscal ? String(row.regimen_fiscal) : null,
        cpFiscal: row.cp_fiscal ? String(row.cp_fiscal) : null,
      },
    });

    // El desglose lo calculamos aqui: el provider puede devolver uno propio,
    // pero el contrato no lo garantiza (MANUAL/NULL devuelven null).
    return {
      ...cobro,
      monto: cobro.monto || montoNeto,
      desglose: cobro.desglose ?? desglose,
    };
  }

  /**
   * Confirma un pago y activa la suscripcion. Es la accion del superusuario con
   * el proveedor MANUAL; con un proveedor real esto lo dispararia el webhook.
   */
  async confirmarPago(
    idSuscripcion: number,
    idUsuarioConfirmador: number,
    dto: ConfirmarPagoSuscripcionDto,
  ): Promise<SuscripcionRecord> {
    const idCondominio = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        SELECT *
        FROM suscripciones_condominio
        WHERE id_suscripcion = $1
        FOR UPDATE
        `,
        [idSuscripcion],
      );

      if (rows.length === 0) {
        throw new NotFoundException('No se encontro la suscripcion indicada.');
      }

      const suscripcion = rows[0] as SuscripcionRow;
      const periodo = String(suscripcion.periodo ?? 'MENSUAL') as 'MENSUAL' | 'ANUAL';
      const inicio = new Date();
      const fin = new Date(inicio);
      if (periodo === 'ANUAL') {
        fin.setFullYear(fin.getFullYear() + 1);
      } else {
        fin.setMonth(fin.getMonth() + 1);
      }

      const monto = Number(suscripcion.monto ?? this.montoBase());
      const moneda = String(suscripcion.moneda ?? 'MXN');
      const referencia =
        dto.referencia?.trim() || String(suscripcion.referencia_pago ?? `ELYX-${idSuscripcion}`);

      await manager.query(
        `
        INSERT INTO pagos_suscripcion (
          id_suscripcion, proveedor, referencia, monto, moneda, estado, metodo,
          periodo_inicio, periodo_fin, confirmado_por, fecha, payload
        )
        VALUES ($1, $2, $3, $4, $5, 'PAGADO', $6, $7, $8, $9, NOW(), $10)
        `,
        [
          idSuscripcion,
          this.provider.nombre,
          referencia,
          monto,
          moneda,
          dto.metodo ?? 'MANUAL',
          inicio.toISOString(),
          fin.toISOString(),
          idUsuarioConfirmador,
          JSON.stringify({ nota: dto.nota ?? null }),
        ],
      );

      await manager.query(
        `
        UPDATE suscripciones_condominio
        SET estado = 'ACTIVA',
            fecha_inicio = $2,
            fecha_fin = $3,
            referencia_pago = COALESCE(referencia_pago, $4),
            actualizado_en = NOW()
        WHERE id_suscripcion = $1
        `,
        [idSuscripcion, inicio.toISOString(), fin.toISOString(), referencia],
      );

      const idCondominioValue = Number(suscripcion.id_condominio);
      await manager.query(
        `UPDATE condominios SET estado = 'ACTIVO' WHERE id_condominio = $1`,
        [idCondominioValue],
      );

      const admins = await manager.query(
        `
        SELECT id_usuario_condominio
        FROM usuarios_condominios
        WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
        `,
        [idCondominioValue],
      );

      for (const admin of admins as Array<Record<string, unknown>>) {
        const idUsuarioCondominio = Number(admin.id_usuario_condominio);
        await manager.query(
          `
          INSERT INTO notificaciones (
            tipo, canal, asunto, mensaje, fecha_programada, fecha_envio, estado,
            id_usuario_condominio, id_config
          )
          VALUES ('SUSCRIPCION_ACTIVA', 'INTERNA', $1, $2, NOW(), NOW(), 'ENVIADA', $3, NULL)
          `,
          [
            'Suscripcion activada',
            'El pago de la suscripcion fue confirmado. Ya puedes generar el enlace de invitacion.',
            idUsuarioCondominio,
          ],
        );

        this.notificacionesGateway.emitNotificacionChanged(
          idCondominioValue,
          idUsuarioCondominio,
          { tipo: 'SUSCRIPCION_ACTIVA' },
        );
      }

      return idCondominioValue;
    });

    const actualizada = await this.obtenerMia(idCondominio);
    if (!actualizada) {
      throw new NotFoundException('No se encontro la suscripcion indicada.');
    }
    return actualizada;
  }

  async cambiarEstado(idSuscripcion: number, estado: EstadoSuscripcion): Promise<SuscripcionRecord> {
    const rows = await this.dataSource.query(
      `SELECT id_condominio FROM suscripciones_condominio WHERE id_suscripcion = $1`,
      [idSuscripcion],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la suscripcion indicada.');
    }

    await this.dataSource.query(
      `UPDATE suscripciones_condominio SET estado = $2, actualizado_en = NOW() WHERE id_suscripcion = $1`,
      [idSuscripcion, estado],
    );

    if (estado === 'CANCELADA') {
      await this.dataSource.query(
        `UPDATE condominios SET estado = 'SUSPENDIDO' WHERE id_condominio = $1`,
        [Number((rows[0] as Record<string, unknown>).id_condominio)],
      );
    }

    const actualizada = await this.obtenerMia(Number((rows[0] as Record<string, unknown>).id_condominio));
    if (!actualizada) {
      throw new NotFoundException('No se encontro la suscripcion indicada.');
    }
    return actualizada;
  }

  async estadoProveedor(idSuscripcion: number): Promise<{ estado: EstadoCobroProveedor }> {
    const rows = await this.dataSource.query(
      `SELECT referencia_pago FROM suscripciones_condominio WHERE id_suscripcion = $1`,
      [idSuscripcion],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la suscripcion indicada.');
    }

    const referencia = String((rows[0] as Record<string, unknown>).referencia_pago ?? '');
    return { estado: await this.provider.consultarEstado(referencia) };
  }

  /**
   * Marca VENCIDA las suscripciones cuya fecha_fin ya paso y deja el condominio
   * suspendido. Sin esto el cobro seria decorativo: nadie perderia acceso.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async suspenderVencidas(): Promise<void> {
    if (!this.estaHabilitada()) {
      return;
    }

    try {
      const rows = await this.dataSource.query(
        `
        UPDATE suscripciones_condominio
        SET estado = 'VENCIDA', actualizado_en = NOW()
        WHERE estado = 'ACTIVA'
          AND fecha_fin IS NOT NULL
          AND fecha_fin < NOW()
        RETURNING id_condominio
        `,
      );

      const condominios = (rows as Array<Record<string, unknown>>)
        .map((row) => Number(row.id_condominio))
        .filter((id) => Number.isInteger(id) && id > 0);

      for (const idCondominio of condominios) {
        await this.dataSource.query(
          `UPDATE condominios SET estado = 'SUSPENDIDO' WHERE id_condominio = $1`,
          [idCondominio],
        );
      }

      if (condominios.length > 0) {
        this.logger.log(`Suscripciones vencidas y condominios suspendidos: ${condominios.length}`);
      }
    } catch (error) {
      this.logger.error('No fue posible procesar las suscripciones vencidas.', error as Error);
    }
  }

  /**
   * Elimina los condominios que nunca pagaron. Se ejecuta solo con cobro
   * activo y respeta `SUSCRIPCION_PURGA_DIAS` (por defecto 30).
   *
   * Borra tambien al administrador si no tiene otras membresias, para no dejar
   * usuarios huerfanos.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgarSinPago(): Promise<void> {
    if (!this.estaHabilitada()) {
      return;
    }

    const dias = Number(process.env.SUSCRIPCION_PURGA_DIAS ?? 30);
    if (!Number.isFinite(dias) || dias <= 0) {
      return;
    }

    try {
      const rows = await this.dataSource.query(
        `
        SELECT c.id_condominio
        FROM condominios c
        JOIN suscripciones_condominio s ON s.id_condominio = c.id_condominio
        WHERE c.estado = 'PENDIENTE_PAGO'
          AND s.estado = 'PENDIENTE'
          AND c.fecha_alta < NOW() - ($1 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM pagos_suscripcion p
            WHERE p.id_suscripcion = s.id_suscripcion AND p.estado = 'PAGADO'
          )
          -- No se borra un condominio que empezo a pagar hace poco: pudo
          -- abandonar el checkout y volver, o el webhook puede estar en vuelo.
          AND NOT EXISTS (
            SELECT 1 FROM stripe_eventos e
            WHERE e.tipo = 'checkout.session.completed'
              AND e.procesado_en > NOW() - INTERVAL '24 hours'
              AND (e.payload -> 'data' -> 'object' ->> 'client_reference_id') = s.referencia_pago
          )
        LIMIT 50
        `,
        [dias],
      );

      const ids = (rows as Array<Record<string, unknown>>)
        .map((row) => Number(row.id_condominio))
        .filter((id) => Number.isInteger(id) && id > 0);

      for (const idCondominio of ids) {
        await this.dataSource.transaction(async (manager) => {
          const usuarios = await manager.query(
            `
            SELECT DISTINCT id_usuario FROM usuarios_condominios WHERE id_condominio = $1
            `,
            [idCondominio],
          );

          await manager.query(`DELETE FROM condominios WHERE id_condominio = $1`, [idCondominio]);

          for (const usuario of usuarios as Array<Record<string, unknown>>) {
            const idUsuario = Number(usuario.id_usuario);
            if (!Number.isInteger(idUsuario)) {
              continue;
            }
            // Solo se elimina la cuenta si quedo sin ninguna membresia.
            await manager.query(
              `
              DELETE FROM usuarios
              WHERE id_usuario = $1
                AND es_superusuario = FALSE
                AND NOT EXISTS (
                  SELECT 1 FROM usuarios_condominios WHERE id_usuario = $1
                )
              `,
              [idUsuario],
            );
          }
        });
      }

      if (ids.length > 0) {
        this.logger.log(`Condominios sin pago eliminados: ${ids.length}`);
      }
    } catch (error) {
      this.logger.error('No fue posible purgar los condominios sin pago.', error as Error);
    }
  }

  /**
   * Portal de cliente de Stripe: el administrador actualiza su tarjeta, ve
   * facturas o cancela sin pasar por Elyx.
   */
  async crearPortalCliente(
    idCondominio: number,
  ): Promise<{ url: string }> {
    if (!this.provider.disponible || this.provider.nombre !== 'STRIPE') {
      throw new BadRequestException(
        'El portal de cliente solo esta disponible con el proveedor STRIPE.',
      );
    }

    const rows = await this.dataSource.query(
      `SELECT proveedor_cliente_id FROM suscripciones_condominio WHERE id_condominio = $1 LIMIT 1`,
      [idCondominio],
    );

    const idCliente = rows.length > 0
      ? (rows[0] as Record<string, unknown>).proveedor_cliente_id
      : null;

    if (!idCliente) {
      throw new BadRequestException(
        'El condominio aun no tiene un cliente de Stripe. Inicia el checkout primero.',
      );
    }

    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      throw new BadRequestException('Stripe no esta configurado.');
    }

    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .replace(/\/+$/, '');

    const sesion = await stripe.billingPortal.sessions.create({
      customer: String(idCliente),
      return_url: `${base}/suscripcion`,
      locale: 'es',
    });

    return { url: sesion.url };
  }

  /**
   * Ajusta la cantidad facturada cuando cambian las unidades del condominio.
   *
   * Stripe prorratea automaticamente: si bajan, emite una nota de credito por
   * los dias no usados; si suben, cobra el proporcional en la proxima factura.
   */
  async sincronizarCantidad(
    idCondominio: number,
    nuevasUnidades: number,
  ): Promise<{ sincronizado: boolean; motivo?: string }> {
    if (!this.provider.disponible || this.provider.nombre !== 'STRIPE') {
      return { sincronizado: false, motivo: 'proveedor-no-stripe' };
    }

    const unidades = Math.max(Math.floor(nuevasUnidades), 1);

    const rows = await this.dataSource.query(
      `
      SELECT id_suscripcion, id_externo, stripe_subscription_item_id,
             stripe_item_unidades_id, stripe_item_ajuste_id, estado
      FROM suscripciones_condominio
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      return { sincronizado: false, motivo: 'sin-suscripcion' };
    }

    const row = rows[0] as Record<string, unknown>;
    // `stripe_subscription_item_id` se conserva como respaldo: en suscripciones
    // creadas antes de separar los items apunta al de unidades.
    const itemUnidadesId = row.stripe_item_unidades_id
      ? String(row.stripe_item_unidades_id)
      : row.stripe_subscription_item_id
        ? String(row.stripe_subscription_item_id)
        : null;
    const itemAjusteId = row.stripe_item_ajuste_id
      ? String(row.stripe_item_ajuste_id)
      : null;

    if (String(row.estado) !== 'ACTIVA' || !itemUnidadesId) {
      // Sin item o sin suscripcion activa no hay nada que prorratear: la nueva
      // cantidad se aplicara en el proximo checkout.
      return { sincronizado: false, motivo: 'suscripcion-no-activa' };
    }

    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      return { sincronizado: false, motivo: 'stripe-no-configurado' };
    }

    const desglose = calcularDesglose(unidades);

    // Solo cambia la cantidad del item de unidades: la cuota base y el ajuste
    // tienen sus propios items.
    await stripe.subscriptionItems.update(itemUnidadesId, {
      quantity: unidades,
      proration_behavior: 'create_prorations',
    });

    await this.reconciliarAjuste(
      desglose,
      row.id_externo ? String(row.id_externo) : null,
      itemAjusteId,
    );

    await this.dataSource.query(
      `
      UPDATE suscripciones_condominio
      SET unidades_facturadas = $2, cupo_unidades = $2, monto = $3, actualizado_en = NOW()
      WHERE id_condominio = $1
      `,
      [idCondominio, unidades, desglose.neto],
    );

    this.logger.log(
      `Suscripcion de condominio ${idCondominio} ajustada a ${unidades} unidades (prorrateo).`,
    );

    return { sincronizado: true };
  }

  /**
   * Mantiene la linea de ajuste al piso mensual en sincronia con las unidades.
   *
   * Al subir las unidades el piso deja de aplicar y la linea debe desaparecer;
   * al bajarlas puede volver a aplicar. Se usa `price_data` porque el importe
   * cambia con cada cantidad y crear Price objects sueltos ensuciaria el
   * catalogo del Dashboard.
   */
  private async reconciliarAjuste(
    desglose: DesglosePrecio,
    idSuscripcionExterna: string | null,
    itemAjusteId: string | null,
  ): Promise<void> {
    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      return;
    }

    const ajuste = ajustePiso(desglose);

    if (ajuste <= 0) {
      if (!itemAjusteId) {
        return;
      }
      // Ya no aplica el piso: se quita la linea para no seguir cobrandola.
      await stripe.subscriptionItems
        .del(itemAjusteId, { proration_behavior: 'create_prorations' })
        .catch((error: unknown) => {
          this.logger.warn(
            `No fue posible quitar el ajuste de piso (${itemAjusteId}): ${String(error)}`,
          );
        });
      await this.dataSource.query(
        `UPDATE suscripciones_condominio SET stripe_item_ajuste_id = NULL, actualizado_en = NOW()
         WHERE stripe_item_ajuste_id = $1`,
        [itemAjusteId],
      );
      return;
    }

    const productoId = await this.stripeClient.obtenerProductoAjuste();

    if (!productoId) {
      // Sin producto no se puede crear el precio inline. Se avisa y se deja el
      // cobro como esta: es preferible un ajuste faltante y visible en logs que
      // romper el cambio de unidades.
      this.logger.warn(
        `No se pudo reconciliar el ajuste de piso del condominio: falta el producto de Stripe.`,
      );
      return;
    }

    const priceData = {
      currency: desglose.moneda.toLowerCase(),
      unit_amount: Math.round(ajuste * 100),
      recurring: { interval: 'month' as const },
      tax_behavior: 'exclusive' as const,
      // `subscriptionItems` con `price_data` exige el ID del producto; el
      // nombre y la descripcion viven en el producto (ver StripeClientService).
      product: productoId,
    };

    if (itemAjusteId) {
      await stripe.subscriptionItems.update(itemAjusteId, {
        price_data: priceData,
        quantity: 1,
        proration_behavior: 'create_prorations',
      });
      return;
    }

    if (!idSuscripcionExterna) {
      return;
    }

    // El piso empezo a aplicar: se agrega la linea a la suscripcion existente.
    const item = await stripe.subscriptionItems.create({
      subscription: idSuscripcionExterna,
      price_data: priceData,
      quantity: 1,
      proration_behavior: 'create_prorations',
    });

    await this.dataSource.query(
      `UPDATE suscripciones_condominio SET stripe_item_ajuste_id = $2, actualizado_en = NOW()
       WHERE id_externo = $1`,
      [idSuscripcionExterna, item.id],
    );
  }

  /** Datos fiscales capturados (para CFDI futuro). */
  async obtenerDatosFiscales(idCondominio: number) {
    const rows = await this.dataSource.query(
      `
      SELECT rfc, razon_social, regimen_fiscal, cp_fiscal, correo_facturacion
      FROM condominios WHERE id_condominio = $1 LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      rfc: row.rfc ? String(row.rfc) : null,
      razonSocial: row.razon_social ? String(row.razon_social) : null,
      regimenFiscal: row.regimen_fiscal ? String(row.regimen_fiscal) : null,
      cpFiscal: row.cp_fiscal ? String(row.cp_fiscal) : null,
      correoFacturacion: row.correo_facturacion ? String(row.correo_facturacion) : null,
      completo: Boolean(row.rfc && row.razon_social && row.regimen_fiscal && row.cp_fiscal),
    };
  }

  async actualizarDatosFiscales(
    idCondominio: number,
    datos: {
      rfc?: string | null;
      razonSocial?: string | null;
      regimenFiscal?: string | null;
      cpFiscal?: string | null;
      correoFacturacion?: string | null;
    },
  ) {
    await this.dataSource.query(
      `
      UPDATE condominios
      SET rfc = COALESCE($2, rfc),
          razon_social = COALESCE($3, razon_social),
          regimen_fiscal = COALESCE($4, regimen_fiscal),
          cp_fiscal = COALESCE($5, cp_fiscal),
          correo_facturacion = COALESCE($6, correo_facturacion)
      WHERE id_condominio = $1
      `,
      [
        idCondominio,
        datos.rfc?.trim().toUpperCase() || null,
        datos.razonSocial?.trim() || null,
        datos.regimenFiscal?.trim() || null,
        datos.cpFiscal?.trim() || null,
        datos.correoFacturacion?.trim().toLowerCase() || null,
      ],
    );

    return this.obtenerDatosFiscales(idCondominio);
  }

  /**
   * Suspende por impago tras el periodo de gracia.
   *
   * Los 7 dias cuentan desde `vencida_desde`, que se fija en el primer fallo y
   * NO se reinicia con los reintentos de Stripe.
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async suspenderPorImpago(): Promise<void> {
    if (!this.estaHabilitada()) {
      return;
    }

    const dias = Number(process.env.SUSCRIPCION_DIAS_GRACIA ?? 7);
    if (!Number.isFinite(dias) || dias <= 0) {
      return;
    }

    try {
      const rows = await this.dataSource.query(
        `
        UPDATE suscripciones_condominio
        SET estado = 'VENCIDA', actualizado_en = NOW()
        WHERE estado = 'VENCIDA'
          AND vencida_desde IS NOT NULL
          AND vencida_desde < NOW() - ($1 || ' days')::interval
        RETURNING id_condominio
        `,
        [dias],
      );

      const condominios = (rows as Array<Record<string, unknown>>)
        .map((row) => Number(row.id_condominio))
        .filter((id) => Number.isInteger(id) && id > 0);

      for (const idCondominio of condominios) {
        await this.dataSource.query(
          `UPDATE condominios SET estado = 'SUSPENDIDO' WHERE id_condominio = $1`,
          [idCondominio],
        );

        await this.dataSource.query(
          `
          INSERT INTO notificaciones (
            tipo, canal, asunto, mensaje, fecha_programada, fecha_envio, estado,
            id_usuario_condominio, id_config
          )
          SELECT 'SUSCRIPCION_SUSPENDIDA', 'INTERNA', $1, $2, NOW(), NOW(), 'ENVIADA',
                 uc.id_usuario_condominio, NULL
          FROM usuarios_condominios uc
          WHERE uc.id_condominio = $3 AND uc.rol = 'ADMINISTRADOR' AND uc.estado = 'ACTIVO'
          `,
          [
            'Condominio suspendido',
            `Pasaron ${dias} dias sin recibir el pago de la suscripcion. El condominio quedo en solo lectura; puedes seguir consultando el historial.`,
            idCondominio,
          ],
        );
      }

      if (condominios.length > 0) {
        this.logger.log(`Condominios suspendidos por impago: ${condominios.length}`);
      }
    } catch (error) {
      this.logger.error('No fue posible suspender por impago.', error as Error);
    }
  }

  /**
   * Reconciliacion diaria: los webhooks SIEMPRE pierden alguno.
   *
   * Para cada suscripcion con `id_externo` se consulta Stripe y se corrige el
   * estado local. Es la red de seguridad detras del webhook.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async reconciliarConStripe(): Promise<void> {
    if (!this.estaHabilitada() || this.provider.nombre !== 'STRIPE') {
      return;
    }

    const stripe = this.stripeClient.cliente;
    if (!stripe) {
      return;
    }

    try {
      // Paso 1: suscripciones que nunca recibieron un webhook (`id_externo`
      // NULL). Sin esto la red de seguridad no cubriria su caso, que es
      // justamente el mas probable: un endpoint mal configurado.
      await this.recuperarSinIdExterno(stripe);

      const rows = await this.dataSource.query(
        `
        SELECT id_suscripcion, id_condominio, id_externo, estado
        FROM suscripciones_condominio
        WHERE id_externo IS NOT NULL
          AND estado IN ('PENDIENTE', 'ACTIVA', 'VENCIDA')
        LIMIT 100
        `,
      );

      let corregidas = 0;

      for (const fila of rows as Array<Record<string, unknown>>) {
        const idExterno = String(fila.id_externo ?? '');
        if (!idExterno.startsWith('sub_')) {
          continue;
        }

        let suscripcion: Stripe.Subscription;
        try {
          suscripcion = await stripe.subscriptions.retrieve(idExterno);
        } catch (error) {
          this.logger.warn(
            `No se pudo consultar la suscripcion ${idExterno}: ${(error as Error).message}`,
          );
          continue;
        }

        const estadoStripe =
          suscripcion.status === 'active' || suscripcion.status === 'trialing'
            ? 'ACTIVA'
            : suscripcion.status === 'past_due' || suscripcion.status === 'unpaid'
              ? 'VENCIDA'
              : suscripcion.status === 'canceled'
                ? 'CANCELADA'
                : 'PENDIENTE';

        if (estadoStripe === String(fila.estado)) {
          continue;
        }

        const fin = this.fechaDesdeUnix(
          (suscripcion as unknown as { current_period_end?: number }).current_period_end,
        );

        await this.dataSource.query(
          `
          UPDATE suscripciones_condominio
          SET estado = $2, fecha_fin = COALESCE($3, fecha_fin), actualizado_en = NOW()
          WHERE id_suscripcion = $1
          `,
          [Number(fila.id_suscripcion), estadoStripe, fin],
        );

        const idCondominio = Number(fila.id_condominio);
        if (estadoStripe === 'ACTIVA') {
          await this.dataSource.query(
            `UPDATE condominios SET estado = 'ACTIVO' WHERE id_condominio = $1`,
            [idCondominio],
          );
        } else if (estadoStripe === 'CANCELADA') {
          await this.dataSource.query(
            `UPDATE condominios SET estado = 'SUSPENDIDO' WHERE id_condominio = $1`,
            [idCondominio],
          );
        }

        corregidas += 1;
      }

      if (corregidas > 0) {
        this.logger.log(`Suscripciones reconciliadas con Stripe: ${corregidas}`);
      }
    } catch (error) {
      this.logger.error('Fallo la reconciliacion con Stripe.', error as Error);
    }
  }

  private fechaDesdeUnix(segundos: number | null | undefined): string | null {
    if (!segundos || !Number.isFinite(segundos)) {
      return null;
    }
    return new Date(segundos * 1000).toISOString();
  }

  /**
   * Rescata suscripciones que se quedaron sin `id_externo` porque el webhook de
   * Stripe nunca llego (endpoint no configurado, secreto equivocado, caida).
   *
   * Sin este paso la reconciliacion diaria no ve esas filas: filtra por
   * `id_externo IS NOT NULL`, que es precisamente lo que el webhook escribe. El
   * cliente pagaria y su condominio seguiria `PENDIENTE` para siempre.
   *
   * Se busca por `client_reference_id` (la referencia `ELYX-AAAA-######`) en las
   * Checkout Sessions recientes.
   */
  private async recuperarSinIdExterno(stripe: Stripe): Promise<number> {
    const rows = await this.dataSource.query(
      `
      SELECT id_suscripcion, id_condominio, referencia_pago
      FROM suscripciones_condominio
      WHERE id_externo IS NULL
        AND estado = 'PENDIENTE'
        AND referencia_pago IS NOT NULL
        AND creado_en > NOW() - INTERVAL '120 days'
      LIMIT 50
      `,
    );

    if (rows.length === 0) {
      return 0;
    }

    // Se pagina una sola vez por corrida: las sesiones pagadas son recientes y
    // quedan al principio del listado.
    const sesiones = new Map<string, Stripe.Checkout.Session>();
    let startingAfter: string | undefined;

    try {
      for (let pagina = 0; pagina < 5; pagina += 1) {
        const lote = await stripe.checkout.sessions.list({
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

        for (const sesion of lote.data) {
          if (sesion.client_reference_id) {
            sesiones.set(sesion.client_reference_id, sesion);
          }
        }

        if (!lote.has_more || lote.data.length === 0) {
          break;
        }
        startingAfter = lote.data[lote.data.length - 1].id;
      }
    } catch (error) {
      this.logger.warn(
        `No fue posible listar las sesiones de Stripe: ${(error as Error).message}`,
      );
      return 0;
    }

    let recuperadas = 0;

    for (const fila of rows as Array<Record<string, unknown>>) {
      const referencia = String(fila.referencia_pago ?? '');
      const sesion = sesiones.get(referencia);

      if (!sesion) {
        continue;
      }

      const idSuscripcionStripe =
        typeof sesion.subscription === 'string'
          ? sesion.subscription
          : (sesion.subscription?.id ?? null);
      const idCliente =
        typeof sesion.customer === 'string' ? sesion.customer : (sesion.customer?.id ?? null);

      // Solo interesa la sesion completada: una abierta o vencida no cambia nada.
      if (sesion.status !== 'complete' || !idSuscripcionStripe) {
        continue;
      }

      await this.dataSource.query(
        `
        UPDATE suscripciones_condominio
        SET id_externo = $2,
            proveedor_cliente_id = COALESCE($3, proveedor_cliente_id),
            proveedor = 'STRIPE',
            actualizado_en = NOW()
        WHERE id_suscripcion = $1
        `,
        [Number(fila.id_suscripcion), idSuscripcionStripe, idCliente],
      );

      recuperadas += 1;
    }

    if (recuperadas > 0) {
      this.logger.log(
        `Suscripciones recuperadas sin webhook: ${recuperadas}. Revisa la configuracion del endpoint.`,
      );
    }

    return recuperadas;
  }

  private toRecord(row: SuscripcionRow): SuscripcionRecord {
    const cupo = row.cupo_unidades === null || row.cupo_unidades === undefined
      ? null
      : Number(row.cupo_unidades);

    return {
      idSuscripcion: Number(row.id_suscripcion),
      idCondominio: Number(row.id_condominio),
      nombreCondominio: String(row.nombre_condominio ?? ''),
      estadoCondominio: String(row.estado_condominio ?? ''),
      plan: String(row.plan ?? 'ESTANDAR'),
      cupoUnidades: cupo,
      periodo: String(row.periodo ?? 'MENSUAL') as 'MENSUAL' | 'ANUAL',
      monto: Number(row.monto ?? 0),
      moneda: String(row.moneda ?? 'MXN'),
      estado: String(row.estado ?? 'PENDIENTE') as EstadoSuscripcion,
      proveedor: String(row.proveedor ?? 'MANUAL'),
      referenciaPago: row.referencia_pago ? String(row.referencia_pago) : null,
      fechaInicio: row.fecha_inicio ? new Date(String(row.fecha_inicio)).toISOString() : null,
      fechaFin: row.fecha_fin ? new Date(String(row.fecha_fin)).toISOString() : null,
      renovacionAutomatica: Boolean(row.renovacion_automatica),
      totalPagado: Number(row.total_pagado ?? 0),
      instructivo: row.referencia_pago
        ? (process.env.SUSCRIPCION_DATOS_PAGO ?? '').trim() || null
        : null,
    };
  }

  private montoBase(): number {
    const valor = Number(process.env.SUSCRIPCION_MONTO_BASE ?? 0);
    return Number.isFinite(valor) && valor >= 0 ? valor : 0;
  }

  private generarReferencia(idCondominio: number): string {
    return `ELYX-${new Date().getFullYear()}-${String(idCondominio).padStart(6, '0')}`;
  }

  /** Guarda de uso interno: evita crear cobros cuando no hay cobro activo. */
  assertHabilitada(): void {
    if (!this.estaHabilitada()) {
      throw new BadRequestException('Esta instalacion de Elyx no tiene cobro de suscripcion.');
    }
  }
}
