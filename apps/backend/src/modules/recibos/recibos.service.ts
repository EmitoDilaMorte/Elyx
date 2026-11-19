import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { aCentavos } from '../../common/dinero/recargos';
import { GenerarReciboDto } from './dto/generar-recibo.dto';
import type { ReciboDetalle, ReciboGenerado, ReciboRecord } from './recibos.types';

/** Rol con el que se solicita el recibo. */
export type RolRecibo = 'ADMINISTRADOR' | 'CONDOMINO';

export type ContextoRecibo = {
  rol: RolRecibo;
  /** Membresia del solicitante en el condominio (null para superusuario). */
  idUsuarioCondominio: number | null;
};

type Manager = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

const ETIQUETA_METODO: Record<string, string> = {
  COMPROBANTE: 'Pago registrado (comprobante)',
  SPEI: 'Transferencia SPEI',
  STRIPE: 'Tarjeta (Stripe)',
};

@Injectable()
export class RecibosService {
  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(
    idCondominio: number,
    contexto: ContextoRecibo,
    idPago?: number,
  ): Promise<ReciboRecord[]> {
    const params: Array<number> = [idCondominio];
    let pagoClause = '';

    if (idPago) {
      params.push(idPago);
      pagoClause = ` AND r.id_pago = $${params.length}`;
    }

    /*
     * El condomino solo ve sus recibos. Antes el listado devolvia todos los del
     * condominio: bastaba abrir el historial para saber quien pago y cuanto.
     * Se compara con `id_usuario_condominio_paga` y, para pagos historicos sin
     * esa columna, con la ocupacion de la unidad de la cuota.
     */
    let filtroMembresia = '';
    if (contexto.rol === 'CONDOMINO') {
      if (!contexto.idUsuarioCondominio) {
        throw new ForbiddenException('No tienes una membresia activa en este condominio.');
      }
      params.push(contexto.idUsuarioCondominio);
      filtroMembresia = `
        AND (
          p.id_usuario_condominio_paga = $${params.length}
          OR EXISTS (
            SELECT 1
            FROM unidades_ocupantes uo
            WHERE uo.id_unidad = c.id_unidad
              AND uo.id_usuario_condominio = $${params.length}
          )
        )`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        r.id_recibo,
        r.id_pago,
        c.id_condominio,
        r.folio,
        r.fecha_generacion,
        r.url_pdf
      FROM recibos r
      INNER JOIN pagos p ON p.id_pago = r.id_pago
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      WHERE c.id_condominio = $1${pagoClause}${filtroMembresia}
      ORDER BY r.fecha_generacion DESC
      `,
      params,
    );

    return (rows as Array<Record<string, unknown>>).map((row) => this.toRecord(row, idCondominio));
  }

  /**
   * Genera (o recupera) el recibo de un pago validado y devuelve su detalle.
   *
   * El recibo es un documento **informativo**, no un CFDI. Los datos se leen
   * del pago, la cuota, el condominio y el cargo, no se copian a `recibos`: si
   * cambia la razon social del condominio, el recibo debe mostrar la vigente.
   * La tabla solo guarda el folio y la fecha de emision.
   */
  async generar(input: GenerarReciboDto, contexto: ContextoRecibo): Promise<ReciboGenerado> {
    return this.dataSource.transaction(async (manager) => {
      const pagoRows = await manager.query(
        `
        SELECT
          p.id_pago,
          p.estado,
          p.id_usuario_condominio_paga,
          c.id_cuota,
          c.id_unidad
        FROM pagos p
        INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
        WHERE p.id_pago = $1 AND c.id_condominio = $2
        FOR UPDATE OF p
        `,
        [input.idPago, input.idCondominio],
      );

      const filas = this.filasDe(pagoRows);
      if (filas.length === 0) {
        throw new NotFoundException('No se encontro el pago para el condominio indicado.');
      }

      const pago = filas[0];
      if (String(pago.estado) !== 'VALIDADO') {
        throw new BadRequestException('Solo se puede generar recibo para pagos en estado VALIDADO.');
      }

      if (contexto.rol === 'CONDOMINO') {
        const autorizado = await this.puedeVerPago(manager, pago, contexto.idUsuarioCondominio);
        if (!autorizado) {
          throw new ForbiddenException('Solo puedes generar el recibo de tus propios pagos.');
        }
      }

      let recibo = await this.buscarRecibo(manager, input.idPago);

      if (!recibo) {
        const now = new Date();
        const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
        const folio = `ELYX-${input.idCondominio}-${input.idPago}-${stamp}`;
        const urlPdf = input.urlPdf?.trim() ?? `https://files.elyx.local/recibos/${folio}.pdf`;

        const createdRows = await manager.query(
          `
          INSERT INTO recibos (folio, fecha_generacion, url_pdf, id_pago)
          VALUES ($1, NOW(), $2, $3)
          RETURNING id_recibo, id_pago, folio, fecha_generacion, url_pdf
          `,
          [folio, urlPdf, input.idPago],
        );

        const creadas = this.filasDe(createdRows);
        if (creadas.length === 0) {
          throw new BadRequestException('No fue posible generar el recibo.');
        }
        recibo = creadas[0];
      }

      const detalle = await this.detalleEnTransaccion(manager, input.idPago, input.idCondominio);
      const base = this.toRecord(recibo, input.idCondominio);

      return { ...base, detalle };
    });
  }

  /** Recibo existente del pago, si ya se habia generado. */
  private async buscarRecibo(
    manager: Manager,
    idPago: number,
  ): Promise<Record<string, unknown> | null> {
    const rows = await manager.query(
      `
      SELECT id_recibo, id_pago, folio, fecha_generacion, url_pdf
      FROM recibos
      WHERE id_pago = $1
      LIMIT 1
      `,
      [idPago],
    );

    const filas = this.filasDe(rows);
    return filas.length > 0 ? filas[0] : null;
  }

  /**
   * `true` si la membresia puede ver el pago.
   *
   * Se acepta por dos vias: que el pago registre esa membresia como pagador, o
   * que la membresia haya ocupado la unidad de la cuota. La segunda cubre los
   * pagos de Stripe/SPEI antiguos, donde `id_usuario_condominio_paga` quedo en
   * NULL, y al condomino que se mudo despues de pagar.
   */
  private async puedeVerPago(
    manager: Manager,
    pago: Record<string, unknown>,
    idUsuarioCondominio: number | null,
  ): Promise<boolean> {
    if (!idUsuarioCondominio) {
      return false;
    }

    if (
      pago.id_usuario_condominio_paga &&
      Number(pago.id_usuario_condominio_paga) === idUsuarioCondominio
    ) {
      return true;
    }

    const rows = await manager.query(
      `
      SELECT 1
      FROM unidades_ocupantes uo
      WHERE uo.id_usuario_condominio = $1
        AND uo.id_unidad = $2
      LIMIT 1
      `,
      [idUsuarioCondominio, Number(pago.id_unidad)],
    );

    return this.filasDe(rows).length > 0;
  }

  /** Detalle completo del recibo a partir del pago. */
  private async detalleEnTransaccion(
    manager: Manager,
    idPago: number,
    idCondominio: number,
  ): Promise<ReciboDetalle> {
    const rows = await manager.query(
      `
      SELECT
        r.folio,
        r.fecha_generacion,
        c.id_condominio,
        co.nombre AS condominio_nombre,
        co.direccion AS condominio_direccion,
        co.rfc AS condominio_rfc,
        co.razon_social AS condominio_razon_social,
        co.correo_contacto AS condominio_correo,
        co.telefono_contacto AS condominio_telefono,
        c.id_cuota,
        c.periodo,
        c.tipo,
        c.monto_base,
        c.fecha_limite,
        c.recargo_por_dia,
        u.id_unidad,
        u.clave_unidad,
        u.tipo_unidad,
        p.id_pago,
        p.monto,
        COALESCE(p.monto_recargo, 0) AS monto_recargo,
        p.fecha_pago,
        p.estado,
        p.referencia,
        COALESCE(p.origen, 'COMPROBANTE') AS origen,
        p.id_cargo,
        cc.metodo AS cargo_metodo,
        cc.referencia_spei,
        cc.stripe_payment_intent_id,
        cc.pagado_en,
        pagador.nombre AS pagador_nombre,
        pagador.correo AS pagador_correo,
        ocupante.nombre AS ocupante_nombre,
        ocupante.correo AS ocupante_correo
      FROM pagos p
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      INNER JOIN condominios co ON co.id_condominio = c.id_condominio
      LEFT JOIN unidades u ON u.id_unidad = c.id_unidad
      LEFT JOIN cargos_cuota cc ON cc.id_cargo = p.id_cargo
      LEFT JOIN recibos r ON r.id_pago = p.id_pago
      -- Pagador declarado en el pago.
      LEFT JOIN LATERAL (
        SELECT
          trim(concat_ws(' ', us.nombre, us.primer_apellido, us.segundo_apellido)) AS nombre,
          us.correo
        FROM usuarios_condominios uc
        INNER JOIN usuarios us ON us.id_usuario = uc.id_usuario
        WHERE uc.id_usuario_condominio = p.id_usuario_condominio_paga
        LIMIT 1
      ) pagador ON TRUE
      -- Respaldo: ocupante de la unidad. Primero el vigente; si nadie la ocupa
      -- hoy (el condomino se mudo), el ultimo que la ocupo.
      LEFT JOIN LATERAL (
        SELECT
          trim(concat_ws(' ', us.nombre, us.primer_apellido, us.segundo_apellido)) AS nombre,
          us.correo
        FROM unidades_ocupantes uo
        INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = uo.id_usuario_condominio
        INNER JOIN usuarios us ON us.id_usuario = uc.id_usuario
        WHERE uo.id_unidad = c.id_unidad
        ORDER BY
          CASE WHEN uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE THEN 0 ELSE 1 END,
          uo.fecha_inicio DESC,
          uo.id_ocupacion DESC
        LIMIT 1
      ) ocupante ON TRUE
      WHERE p.id_pago = $1 AND c.id_condominio = $2
      LIMIT 1
      `,
      [idPago, idCondominio],
    );

    const filas = this.filasDe(rows);
    if (filas.length === 0) {
      throw new NotFoundException('No se encontro el pago para el condominio indicado.');
    }

    const row = filas[0];
    const montoBase = aCentavos(row.monto_base);
    const monto = aCentavos(row.monto);
    const montoRecargo = aCentavos(row.monto_recargo);
    // El ajuste solo puede aparecer en pagos historicos sin desglose; un
    // centavo suelto por redondeo no se muestra como concepto.
    const diferencia = aCentavos(monto - montoBase - montoRecargo);
    const ajuste = Math.abs(diferencia) >= 0.01 ? diferencia : 0;

    const origen = (row.origen
      ? String(row.origen)
      : 'COMPROBANTE') as ReciboDetalle['pago']['origen'];

    return {
      folio: String(row.folio ?? ''),
      fechaGeneracion: this.aIso(row.fecha_generacion),
      condominio: {
        nombre: String(row.condominio_nombre ?? ''),
        direccion: row.condominio_direccion ? String(row.condominio_direccion) : null,
        rfc: row.condominio_rfc ? String(row.condominio_rfc) : null,
        razonSocial: row.condominio_razon_social
          ? String(row.condominio_razon_social)
          : null,
        correoContacto: row.condominio_correo ? String(row.condominio_correo) : null,
        telefonoContacto: row.condominio_telefono ? String(row.condominio_telefono) : null,
      },
      unidad: row.id_unidad
        ? {
            idUnidad: Number(row.id_unidad),
            claveUnidad: String(row.clave_unidad ?? ''),
            tipoUnidad: String(row.tipo_unidad ?? ''),
          }
        : null,
      condomino: row.pagador_nombre
        ? {
            nombre: String(row.pagador_nombre),
            correo: row.pagador_correo ? String(row.pagador_correo) : null,
          }
        : row.ocupante_nombre
          ? {
              nombre: String(row.ocupante_nombre),
              correo: row.ocupante_correo ? String(row.ocupante_correo) : null,
            }
          : null,
      cuota: {
        idCuota: Number(row.id_cuota),
        periodo: String(row.periodo ?? ''),
        tipo: String(row.tipo ?? 'Cuota de mantenimiento'),
        montoBase,
        fechaLimite: this.aFechaCalendario(row.fecha_limite),
        recargoPorDia: aCentavos(row.recargo_por_dia),
      },
      pago: {
        idPago: Number(row.id_pago),
        fechaPago: this.aIso(row.fecha_pago),
        estado: String(row.estado ?? ''),
        origen,
        metodoPago: ETIQUETA_METODO[origen] ?? origen,
        referencia: row.referencia ? String(row.referencia) : null,
        monto,
        montoRecargo,
        montoCapital: montoBase,
        ajuste,
      },
      cargo: row.id_cargo
        ? {
            idCargo: Number(row.id_cargo),
            metodo: String(row.cargo_metodo ?? ''),
            referenciaSpei: row.referencia_spei ? String(row.referencia_spei) : null,
            paymentIntentId: row.stripe_payment_intent_id
              ? String(row.stripe_payment_intent_id)
              : null,
            pagadoEn: row.pagado_en ? this.aIso(row.pagado_en) : null,
          }
        : null,
    };
  }

  private toRecord(row: Record<string, unknown>, idCondominio: number): ReciboRecord {
    return {
      idRecibo: Number(row.id_recibo),
      idPago: Number(row.id_pago),
      idCondominio,
      folio: String(row.folio),
      fechaGeneracion: this.aIso(row.fecha_generacion),
      urlPdf: String(row.url_pdf),
    };
  }

  /** Normaliza `RETURNING`: TypeORM puede envolver las filas en `[filas, n]`. */
  private filasDe(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) {
      return [];
    }
    if (raw.length > 0 && Array.isArray(raw[0])) {
      return (raw[0] as Array<Record<string, unknown>>) ?? [];
    }
    return raw as Array<Record<string, unknown>>;
  }

  private aIso(valor: unknown): string {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      return valor.toISOString();
    }
    const fecha = new Date(String(valor ?? ''));
    return Number.isNaN(fecha.getTime()) ? new Date().toISOString() : fecha.toISOString();
  }

  /** Fecha de calendario `YYYY-MM-DD` sin desplazarla por zona horaria. */
  private aFechaCalendario(valor: unknown): string {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      const dosDigitos = (numero: number) => String(numero).padStart(2, '0');
      return `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
    }
    const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''));
    return coincidencia ? coincidencia[0] : '';
  }
}
