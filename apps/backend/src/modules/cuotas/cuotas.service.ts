import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  private readonly logger = new Logger(CuotasService.name);

  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(idCondominio: number): Promise<CuotaRecord[]> {
    await this.asegurarCuotasHastaPeriodoActual(idCondominio);

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
    await this.asegurarCuotasHastaPeriodoActual(opciones.idCondominio);

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

  /**
   * Marca una cuota como pagada dentro de una transaccion ya abierta.
   *
   * Es el unico lugar donde se escribe `cuotas.estado = 'PAGADA'`. Lo usan el
   * flujo del administrador (`PagosService.aprobar`) y la confirmacion de un
   * cobro en linea (`CobrosService`). Tenerlo en un solo metodo evita que un
   * camino marque la cuota y el otro se olvide.
   *
   * Recibe el `manager` de la transaccion a proposito: `dataSource.query` usa
   * otra conexion del pool y no veria las filas sin confirmar de la transaccion
   * en curso.
   *
   * `recargo_por_dia = 0` es intencional: al pagar se congelan los recargos
   * devengados, para que el estado de cuenta no siga creciendo.
   */
  async marcarPagadaEnTransaccion(
    manager: { query: (query: string, parameters?: unknown[]) => Promise<unknown> },
    idCuota: number,
  ): Promise<void> {
    await manager.query(
      `
      UPDATE cuotas
      SET estado = 'PAGADA', recargo_por_dia = 0
      WHERE id_cuota = $1
      `,
      [idCuota],
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

  /**
   * Estado de cuenta de un condomino: el resumen que ve en su panel.
   *
   * Se **calcula** desde `cuotas` en lugar de leer la tabla `estado_cuenta`,
   * que solo se insertaba al dar de alta la unidad y nunca se actualizaba. Un
   * saldo derivado no debe almacenarse: si se guarda, tarde o temprano difiere
   * de la realidad (un pago validado, un recargo que corre, una cuota nueva).
   *
   * **Recargos**: `recargo_por_dia` es la tasa diaria, no el acumulado. El
   * recargo devengado es `tasa * dias_de_atraso`, contado desde el dia
   * siguiente al vencimiento. La version anterior sumaba la tasa una sola vez
   * (un dia) sin importar el atraso real, asi que subestimaba el adeudo.
   *
   * Se devuelven `totalAdeudo` (capital) y `recargosEstimados` por separado: el
   * condomino y el administrador necesitan ver cuanto es cuota y cuanto es
   * recargo, y un recargo alto debe ser visible, no escondido en un total.
   */
  async estadoCuenta(idCondominio: number, idUsuarioCondominio: number) {
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE c.estado <> 'PAGADA')::int AS cuotas_pendientes,
        COALESCE(SUM(c.monto_base) FILTER (WHERE c.estado <> 'PAGADA'), 0)::numeric AS capital,
        COALESCE(SUM(
          c.recargo_por_dia * GREATEST(CURRENT_DATE - c.fecha_limite, 0)
        ) FILTER (WHERE c.estado <> 'PAGADA'), 0)::numeric AS recargos,
        MIN(c.fecha_limite) FILTER (WHERE c.estado <> 'PAGADA') AS proximo_vencimiento,
        COUNT(*) FILTER (
          WHERE c.estado <> 'PAGADA' AND c.fecha_limite < CURRENT_DATE
        )::int AS cuotas_vencidas,
        (SELECT u.clave_unidad
           FROM unidades_ocupantes uo
           JOIN unidades u ON u.id_unidad = uo.id_unidad
          WHERE uo.id_usuario_condominio = $2
            AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
          ORDER BY uo.id_ocupacion DESC
          LIMIT 1) AS clave_unidad
      FROM cuotas c
      INNER JOIN unidades u ON u.id_unidad = c.id_unidad
      INNER JOIN unidades_ocupantes uo ON uo.id_unidad = u.id_unidad
        AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
      WHERE c.id_condominio = $1
        AND uo.id_usuario_condominio = $2
      `,
      [idCondominio, idUsuarioCondominio],
    );

    const row = (rows[0] ?? {}) as Record<string, unknown>;
    const capital = this.aCentavos(row.capital);
    const recargos = this.aCentavos(row.recargos);

    return {
      idCondominio,
      idUsuarioCondominio,
      claveUnidad: row.clave_unidad ? String(row.clave_unidad) : null,
      cuotasPendientes: Number(row.cuotas_pendientes ?? 0),
      cuotasVencidas: Number(row.cuotas_vencidas ?? 0),
      /** Suma de las cuotas sin pagar, sin recargos. */
      totalAdeudo: capital,
      /** Recargo devengado a la fecha de corte. */
      recargosEstimados: recargos,
      /** Lo que hay que pagar hoy: cuotas + recargos. */
      saldoActual: this.aCentavos(capital + recargos),
      fechaCorte: new Date().toISOString().slice(0, 10),
      proximoVencimiento: row.proximo_vencimiento
        ? this.aFechaIso(row.proximo_vencimiento)
        : null,
    };
  }

  /** Redondeo a centavos: evita 1834.9999999 en importes de dinero. */
  private aCentavos(valor: unknown): number {
    const numero = Number(valor ?? 0);
    return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
  }

  async listByCondomino(idCondominio: number, idUsuarioCondominio: number): Promise<CuotaRecord[]> {
    await this.asegurarCuotasHastaPeriodoActual(idCondominio);

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

  /**
   * Genera las cuotas que falten, mes con mes, hasta el periodo actual.
   *
   * Antes solo se creaba el periodo **actual**: si nadie entraba en marzo, ese
   * mes no existia y el hueco quedaba para siempre. El condominio terminaba con
   * periodos salteados (2026-05 y luego 2026-10) y los reportes financieros
   * mostraban meses incompletos.
   *
   * Ahora se rellena desde el primer periodo facturado hasta el actual. El
   * punto de partida es la **primera cuota existente**, no `fecha_alta`: un
   * condominio dado de alta hace anios pero que empezo a facturar este anio no
   * debe recibir cuotas retroactivas de todo ese tiempo.
   *
   * Es idempotente: `ON CONFLICT (id_unidad, periodo) DO NOTHING` deja intactas
   * las cuotas que ya existen, con su monto y estado reales.
   */
  async asegurarCuotasHastaPeriodoActual(idCondominio: number): Promise<number> {
    const periodoActual = this.currentPeriodKey();

    const rangoRows = await this.dataSource.query(
      `
      SELECT MIN(periodo) AS primer_periodo
      FROM cuotas
      WHERE id_condominio = $1
      `,
      [idCondominio],
    );

    const primerPeriodo =
      rangoRows.length > 0 ? (rangoRows[0] as Record<string, unknown>).primer_periodo : null;

    // Sin cuotas previas no hay plantilla de monto ni dia limite: el primer
    // periodo lo crea el alta del condominio, no este metodo.
    if (!primerPeriodo) {
      return 0;
    }

    const periodos = this.periodosEntre(String(primerPeriodo), periodoActual);
    if (periodos.length === 0) {
      return 0;
    }

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
      return 0;
    }

    const template = templateRows[0] as Record<string, unknown>;
    const montoBase = Number(template.monto_base ?? 0);
    const recargoPorDia = Number(template.recargo_por_dia ?? 0);
    const tipo = String(template.tipo ?? 'Cuota de mantenimiento');
    const fechaTemplate = String(template.fecha_limite ?? new Date().toISOString().slice(0, 10));
    const diaLimite = Number(fechaTemplate.split('-')[2] ?? '10');

    const unidadesRows = await this.dataSource.query(
      `
      SELECT id_unidad, to_char(fecha_alta, 'YYYY-MM') AS periodo_alta
      FROM unidades
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      `,
      [idCondominio],
    );

    let creadas = 0;

    for (const periodo of periodos) {
      const fechaLimite = this.periodDeadline(periodo, diaLimite);

      for (const unidad of unidadesRows as Array<Record<string, unknown>>) {
        // Una unidad dada de alta en marzo no debe cuotas de enero ni febrero:
        // generarlas le crearia una deuda por meses en los que no existia.
        const periodoAlta = unidad.periodo_alta ? String(unidad.periodo_alta) : null;
        if (periodoAlta && periodo < periodoAlta) {
          continue;
        }

        const insertadas = await this.dataSource.query(
          `
          INSERT INTO cuotas (
            periodo, tipo, monto_base, fecha_limite, recargo_por_dia,
            estado, id_condominio, id_unidad
          )
          VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6, $7)
          ON CONFLICT (id_unidad, periodo) DO NOTHING
          RETURNING id_cuota
          `,
          [
            periodo,
            tipo,
            montoBase,
            fechaLimite,
            recargoPorDia,
            idCondominio,
            Number(unidad.id_unidad),
          ],
        );
        if (Array.isArray(insertadas)) {
          creadas += insertadas.length;
        }
      }
    }

    if (creadas > 0) {
      this.logger.log(
        `Cuotas generadas para el condominio ${idCondominio}: ${creadas} ` +
          `(periodos ${periodos[0]} a ${periodoActual}).`,
      );
    }

    return creadas;
  }

  /** Periodos `YYYY-MM` entre dos extremos, ambos incluidos. */
  private periodosEntre(desde: string, hasta: string): string[] {
    const parsear = (periodo: string): { anio: number; mes: number } | null => {
      const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
      if (!coincidencia) {
        return null;
      }
      const anio = Number(coincidencia[1]);
      const mes = Number(coincidencia[2]);
      if (mes < 1 || mes > 12) {
        return null;
      }
      return { anio, mes };
    };

    const inicio = parsear(desde);
    const fin = parsear(hasta);
    if (!inicio || !fin) {
      return [];
    }

    const periodos: string[] = [];
    let { anio, mes } = inicio;

    // Tope de seguridad: 30 anios. Un `primer_periodo` corrupto no debe
    // generar miles de cuotas ni bloquear la peticion.
    for (let guarda = 0; guarda < 360; guarda += 1) {
      const clave = `${anio}-${String(mes).padStart(2, '0')}`;
      if (anio > fin.anio || (anio === fin.anio && mes > fin.mes)) {
        break;
      }
      periodos.push(clave);
      mes += 1;
      if (mes > 12) {
        mes = 1;
        anio += 1;
      }
    }

    return periodos;
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