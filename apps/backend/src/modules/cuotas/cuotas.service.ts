import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type CuotaEstado = 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';

type CuotaRecord = {
  idCuota: number;
  idCondominio: number;
  periodo: string;
  tipo: string;
  monto: number;
  fechaLimite: string;
  recargo: number;
  estado: CuotaEstado;
};

export type CuotaPaginada = CuotaRecord & {
  claveUnidad: string | null;
};

export type MetaPaginacion = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OpcionesListadoCuotas = {
  idCondominio: number;
  idUsuarioCondominio?: number | null;
  page: number;
  pageSize: number;
  q?: string;
  estado?: CuotaEstado | null;
  orden?: string;
};

/** Whitelist de ordenamientos: el valor nunca se interpola sin validar. */
const ORDENES: Record<string, string> = {
  reciente: 'fecha_limite DESC, id_cuota DESC',
  antiguo: 'fecha_limite ASC, id_cuota ASC',
  monto_desc: 'monto_base DESC, fecha_limite DESC',
  monto_asc: 'monto_base ASC, fecha_limite DESC',
};

@Injectable()
export class CuotasService {
  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(idCondominio: number): Promise<CuotaRecord[]> {
    await this.ensureCurrentPeriodCuotas(idCondominio);

    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_cuota,
        c.id_condominio,
        c.periodo,
        c.tipo,
        c.monto_base,
        c.fecha_limite,
        c.recargo_por_dia,
        c.estado AS cuota_estado,
        p.estado AS pago_estado
      FROM cuotas c
      LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
      WHERE c.id_condominio = $1
      ORDER BY c.fecha_limite DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => this.toCuotaRecord(row));
  }

  /**
   * Listado paginado con busqueda, filtro por estado y ordenamiento.
   *
   * Se expone en un endpoint aparte (`/cuotas/paginado`) para no cambiar el
   * contrato de `GET /cuotas`, que el resto de la aplicacion consume como
   * arreglo completo.
   */
  async listarPaginado(opciones: OpcionesListadoCuotas): Promise<{
    items: CuotaPaginada[];
    meta: MetaPaginacion;
  }> {
    await this.ensureCurrentPeriodCuotas(opciones.idCondominio);

    const page = Math.max(1, Math.floor(Number(opciones.page) || 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(opciones.pageSize) || 12)));
    const q = (opciones.q ?? '').trim();
    const busqueda = q.length > 0 ? q : null;
    const estado = opciones.estado ?? null;
    const orden = ORDENES[opciones.orden ?? ''] ?? ORDENES.reciente;
    const idUsuarioCondominio =
      typeof opciones.idUsuarioCondominio === 'number' && opciones.idUsuarioCondominio > 0
        ? opciones.idUsuarioCondominio
        : null;

    const filtros = [opciones.idCondominio, idUsuarioCondominio, busqueda, estado];

    const base = `
      WITH base AS (
        SELECT
          c.id_cuota,
          c.id_condominio,
          c.periodo,
          c.tipo,
          c.monto_base,
          c.fecha_limite,
          c.recargo_por_dia,
          c.estado AS cuota_estado,
          p.estado AS pago_estado,
          u.clave_unidad,
          CASE
            WHEN c.estado = 'PAGADA' THEN 'PAGADA'
            WHEN p.estado = 'CAPTURADO' THEN 'EN_VALIDACION'
            ELSE 'PENDIENTE'
          END AS estado_calculado
        FROM cuotas c
        LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
        LEFT JOIN unidades u ON u.id_unidad = c.id_unidad
        WHERE c.id_condominio = $1
          AND ($2::int IS NULL OR EXISTS (
            SELECT 1 FROM unidades_ocupantes uo
            WHERE uo.id_unidad = c.id_unidad
              AND uo.id_usuario_condominio = $2
              AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
          ))
          AND ($3::text IS NULL
               OR c.periodo ILIKE '%' || $3 || '%'
               OR c.tipo ILIKE '%' || $3 || '%'
               OR u.clave_unidad ILIKE '%' || $3 || '%')
      )
    `;

    const totalRows = (await this.dataSource.query(
      `${base}
       SELECT COUNT(*)::int AS total
       FROM base
       WHERE ($4::text IS NULL OR estado_calculado = $4)`,
      filtros,
    )) as Array<{ total: number }>;

    const total = Number(totalRows[0]?.total ?? 0);

    const rows = (await this.dataSource.query(
      `${base}
       SELECT *
       FROM base
       WHERE ($4::text IS NULL OR estado_calculado = $4)
       ORDER BY ${orden}
       LIMIT $5 OFFSET $6`,
      [...filtros, pageSize, (page - 1) * pageSize],
    )) as Array<Record<string, unknown>>;

    return {
      items: rows.map((row) => ({
        ...this.toCuotaRecord(row),
        claveUnidad: row.clave_unidad ? String(row.clave_unidad) : null,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findByCondominioAndId(idCondominio: number, idCuota: number): Promise<CuotaRecord> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_cuota,
        c.id_condominio,
        c.periodo,
        c.tipo,
        c.monto_base,
        c.fecha_limite,
        c.recargo_por_dia,
        c.estado AS cuota_estado,
        p.estado AS pago_estado
      FROM cuotas c
      LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
      WHERE c.id_condominio = $1 AND c.id_cuota = $2
      LIMIT 1
      `,
      [idCondominio, idCuota],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la cuota para el condominio indicado.');
    }

    return this.toCuotaRecord(rows[0] as Record<string, unknown>);
  }

  async markEnValidacion(idCondominio: number, idCuota: number): Promise<void> {
    await this.findByCondominioAndId(idCondominio, idCuota);
  }

  async markPagada(idCondominio: number, idCuota: number): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuotas
      SET estado = 'PAGADA', recargo_por_dia = 0
      WHERE id_condominio = $1 AND id_cuota = $2
      `,
      [idCondominio, idCuota],
    );
  }

  async markPendiente(idCondominio: number, idCuota: number): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuotas
      SET estado = 'PENDIENTE'
      WHERE id_condominio = $1 AND id_cuota = $2 AND estado <> 'PAGADA'
      `,
      [idCondominio, idCuota],
    );
  }

  async listByCondomino(idCondominio: number, idUsuarioCondominio: number): Promise<CuotaRecord[]> {
    await this.ensureCurrentPeriodCuotas(idCondominio);

    const rows = await this.dataSource.query(
      `SELECT
        c.id_cuota,
        c.id_condominio,
        c.periodo,
        c.tipo,
        c.monto_base,
        c.fecha_limite,
        c.recargo_por_dia,
        c.estado AS cuota_estado,
        p.estado AS pago_estado
      FROM cuotas c
      JOIN unidades u ON u.id_unidad = c.id_unidad
      JOIN unidades_ocupantes uo ON uo.id_unidad = u.id_unidad
      LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
      WHERE c.id_condominio = $1
        AND uo.id_usuario_condominio = $2
        AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
      ORDER BY c.fecha_limite DESC`,
      [idCondominio, idUsuarioCondominio],
    );

    return rows.map((row: Record<string, unknown>) => this.toCuotaRecord(row));
  }

  private async ensureCurrentPeriodCuotas(idCondominio: number) {
    const periodoActual = this.currentPeriodKey();

    const templateRows = await this.dataSource.query(
      `
      SELECT monto_base, recargo_por_dia, fecha_limite, tipo
      FROM cuotas
      WHERE id_condominio = $1
      ORDER BY periodo DESC, id_cuota DESC
      LIMIT 1
      `,
      [idCondominio],
    );

    if (templateRows.length === 0) {
      return;
    }

    const template = templateRows[0] as Record<string, unknown>;
    const montoBase = Number(template.monto_base ?? 0);
    const recargoPorDia = Number(template.recargo_por_dia ?? 0);
    const tipo = String(template.tipo ?? 'Cuota de mantenimiento');
    const fechaTemplate = String(template.fecha_limite ?? `${new Date().toISOString().slice(0, 10)}`);
    const diaLimite = Number(fechaTemplate.split('-')[2] ?? '10');
    const fechaLimite = this.periodDeadline(periodoActual, diaLimite);

    const unidadesRows = await this.dataSource.query(
      `
      SELECT id_unidad
      FROM unidades
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      `,
      [idCondominio],
    );

    for (const unidad of unidadesRows as Array<Record<string, unknown>>) {
      const idUnidad = Number(unidad.id_unidad);
      await this.dataSource.query(
        `
        INSERT INTO cuotas (
          periodo,
          tipo,
          monto_base,
          fecha_limite,
          recargo_por_dia,
          estado,
          id_condominio,
          id_unidad
        )
        VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6, $7)
        ON CONFLICT (id_unidad, periodo) DO NOTHING
        `,
        [periodoActual, tipo, montoBase, fechaLimite, recargoPorDia, idCondominio, idUnidad],
      );
    }
  }

  private currentPeriodKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private periodDeadline(periodo: string, diaLimite: number): string {    const [yearRaw, monthRaw] = periodo.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const clampedDay = Math.max(1, Math.min(28, diaLimite));
    return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  }

  /** Normaliza la fecha limite a ISO corto (YYYY-MM-DD) para clientes y scrapers. */
  private aFechaIso(valor: unknown): string {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      const dosDigitos = (numero: number) => String(numero).padStart(2, '0');
      return `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
    }

    const texto = String(valor ?? '').trim();
    if (!texto) {
      return '';
    }

    const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
    if (coincidencia) {
      return coincidencia[0];
    }

    const fecha = new Date(texto);
    if (!Number.isNaN(fecha.getTime())) {
      const dosDigitos = (numero: number) => String(numero).padStart(2, '0');
      return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
    }

    return texto;
  }

  private toCuotaRecord(row: Record<string, unknown>): CuotaRecord {
    return {
      idCuota: Number(row.id_cuota),
      idCondominio: Number(row.id_condominio),
      periodo: String(row.periodo),
      tipo: String(row.tipo ?? 'Cuota de mantenimiento'),
      monto: Number(row.monto_base),
      fechaLimite: this.aFechaIso(row.fecha_limite),
      recargo: Number(row.recargo_por_dia),
      estado: this.resolveEstado(String(row.cuota_estado), row.pago_estado ? String(row.pago_estado) : null),
    };
  }

  private resolveEstado(cuotaEstado: string, pagoEstado: string | null): CuotaEstado {
    if (cuotaEstado === 'PAGADA') {
      return 'PAGADA';
    }

    if (pagoEstado === 'CAPTURADO') {
      return 'EN_VALIDACION';
    }

    return 'PENDIENTE';
  }
}