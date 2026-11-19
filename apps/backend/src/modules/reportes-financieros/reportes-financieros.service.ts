import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { aCentavos } from '../../common/dinero/recargos';
import { CuotasService } from '../cuotas/cuotas.service';
import type {
  AntiguedadAdeudo,
  BucketAntiguedad,
  CategoriaGasto,
  CobranzaUnidad,
  EstadoCobranzaUnidad,
  KpisReporte,
  MetodoPagoResumen,
  MiUnidadResumen,
  MovimientoGasto,
  MovimientoPago,
  OpcionesResumenReporte,
  PeriodoFinanciero,
  ReporteFinancieroResumen,
} from './reportes-financieros.types';

type ReporteFinancieroRecord = {
  idCondominio: number;
  periodo: string;
  ingresos: number;
  gastos: number;
  /**
   * Comision que Stripe desconto del deposito del condominio por los cargos
   * con tarjeta de ese periodo. Es un gasto de procesamiento real, pero NO se
   * suma a `gastos`: se deriva de `cargos_cuota` para no contar dos veces si
   * el administrador tambien sube los movimientos de Stripe a mano.
   */
  comisiones: number;
  adeudos: number;
};

/** Etiquetas de los buckets de antiguedad, en el orden en que se muestran. */
const BUCKETS: Array<{ clave: BucketAntiguedad; etiqueta: string }> = [
  { clave: 'POR_VENCER', etiqueta: 'Por vencer' },
  { clave: 'D_1_30', etiqueta: '1 a 30 dias' },
  { clave: 'D_31_60', etiqueta: '31 a 60 dias' },
  { clave: 'D_61_90', etiqueta: '61 a 90 dias' },
  { clave: 'MAS_90', etiqueta: 'Mas de 90 dias' },
];

/**
 * Reportes financieros por periodo.
 *
 * Se **calculan** desde `cuotas`, `pagos` y `gastos`; no se leen de la tabla
 * `reportes_financieros`. Esa tabla solo la llenaba el seed: el backend nunca
 * escribia en ella, asi que en una instalacion real los reportes salian vacios
 * y en la demo mostraban tres periodos fijos que no cuadraban con los pagos
 * (los ingresos de 2026-02 decian $9,000 cuando los pagos validados sumaban
 * $7,200).
 *
 * La regla es la misma que en el estado de cuenta: un valor derivado se
 * calcula, no se almacena. Asi el reporte siempre coincide con los movimientos.
 *
 * Criterios por periodo:
 *  - `periodo`  : el periodo de la cuota (`YYYY-MM`). Es la unidad con la que el
 *                 condominio presupuesta y la que el administrador reconoce.
 *  - `ingresos` : pagos VALIDADOS de cuotas de ese periodo.
 *  - `gastos`   : gastos cuya fecha cae en ese mes.
 *  - `adeudos`  : capital de las cuotas de ese periodo que siguen sin pagar.
 *                 Sin recargos: el reporte compara capital contra capital, y los
 *                 recargos ya se ven en el estado de cuenta.
 *
 * Los periodos mostrados son la union de los que tienen cuotas y los que tienen
 * gastos, para que un gasto en un mes sin cuotas no desaparezca del reporte.
 */
@Injectable()
export class ReportesFinancierosService {
  private readonly logger = new Logger(ReportesFinancierosService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cuotasService: CuotasService,
  ) {}

  async listByCondominio(idCondominio: number): Promise<ReporteFinancieroRecord[]> {
    // Genera las cuotas que falten antes de agregar: si un mes no tiene cuotas,
    // el reporte lo omitiria y el administrador veria un hueco sin explicacion.
    await this.cuotasService
      .asegurarCuotasHastaPeriodoActual(idCondominio)
      .catch((error: unknown) => {
        // El reporte debe responder aunque la generacion falle: se muestra lo
        // que ya existe en lugar de devolver un 500.
        this.logger.warn(
          `No fue posible asegurar las cuotas del condominio ${idCondominio}: ${(error as Error).message}`,
        );
        return 0;
      });

    const rows = await this.dataSource.query(
      `
      WITH periodos_cuota AS (
        SELECT
          c.periodo,
          COALESCE(SUM(c.monto_base) FILTER (WHERE c.estado <> 'PAGADA'), 0) AS adeudos,
          COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'VALIDADO'), 0) AS ingresos
        FROM cuotas c
        LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
        WHERE c.id_condominio = $1
        GROUP BY c.periodo
      ),
      periodos_gasto AS (
        SELECT
          to_char(g.fecha, 'YYYY-MM') AS periodo,
          COALESCE(SUM(g.monto), 0) AS gastos
        FROM gastos g
        WHERE g.id_condominio = $1
        GROUP BY 1
      ),
      comisiones_periodo AS (
        SELECT
          c.periodo,
          COALESCE(SUM(cc.monto_comision), 0) AS comisiones
        FROM cargos_cuota cc
        INNER JOIN cuotas c ON c.id_cuota = cc.id_cuota
        WHERE cc.id_condominio = $1
          AND cc.metodo = 'STRIPE'
          AND cc.estado = 'PAGADO'
        GROUP BY c.periodo
      )
      SELECT
        COALESCE(pc.periodo, pg.periodo) AS periodo,
        COALESCE(pc.ingresos, 0) AS ingresos,
        COALESCE(pg.gastos, 0) AS gastos,
        COALESCE(cp.comisiones, 0) AS comisiones,
        COALESCE(pc.adeudos, 0) AS adeudos
      FROM periodos_cuota pc
      FULL OUTER JOIN periodos_gasto pg ON pg.periodo = pc.periodo
      LEFT JOIN comisiones_periodo cp ON cp.periodo = COALESCE(pc.periodo, pg.periodo)
      ORDER BY periodo DESC
      `,
      [idCondominio],
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      idCondominio,
      periodo: String(row.periodo),
      ingresos: this.aCentavos(row.ingresos),
      gastos: this.aCentavos(row.gastos),
      comisiones: this.aCentavos(row.comisiones),
      adeudos: this.aCentavos(row.adeudos),
    }));
  }

  /**
   * Reporte detallado para el panel y las exportaciones.
   *
   * Todo el dinero se agrega en Postgres. Hacerlo en el navegador obligaria a
   * descargar todas las cuotas y todos los pagos en cada cambio de periodo, y
   * el condomino veria datos de otras unidades.
   *
   * **Recargos**: `p.monto - p.monto_recargo` es el capital cobrado y
   * `p.monto_recargo` el recargo. Las cuotas pendientes devengan
   * `tasa * dias`. Un condominio sin recargo configurado obtiene 0 en ambos.
   */
  async resumen(
    idCondominio: number,
    opciones: OpcionesResumenReporte,
  ): Promise<ReporteFinancieroResumen> {
    // Si un mes no tiene cuotas, el reporte lo omitiria. Se generan antes de
    // agregar, igual que en `listByCondominio`; si falla, se reporta lo que ya
    // existe en lugar de devolver un 500.
    await this.cuotasService
      .asegurarCuotasHastaPeriodoActual(idCondominio)
      .catch((error: unknown) => {
        this.logger.warn(
          `No fue posible asegurar las cuotas del condominio ${idCondominio}: ${(error as Error).message}`,
        );
        return 0;
      });

    const condominioRows = await this.dataSource.query(
      `
      SELECT nombre, direccion, rfc, razon_social, correo_contacto, telefono_contacto
      FROM condominios
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [idCondominio],
    );

    if (!Array.isArray(condominioRows) || condominioRows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const condominioRow = condominioRows[0] as Record<string, unknown>;
    const periodosSolicitados = this.normalizarPeriodos(opciones.periodos);

    const disponiblesRows = await this.dataSource.query(
      `
      SELECT c.periodo
      FROM cuotas c
      WHERE c.id_condominio = $1
      GROUP BY c.periodo
      UNION
      SELECT to_char(g.fecha, 'YYYY-MM') AS periodo
      FROM gastos g
      WHERE g.id_condominio = $1
      GROUP BY 1
      ORDER BY periodo DESC
      `,
      [idCondominio],
    );

    const periodosDisponibles = (disponiblesRows as Array<Record<string, unknown>>).map(
      (row) => String(row.periodo),
    );

    // El condomino no ve comisiones: son parte del acuerdo entre el condominio
    // y Stripe, no de su cuota.
    const esAdmin = opciones.rol === 'ADMINISTRADOR';

    const serieRows = await this.dataSource.query(
      `
      WITH periodos AS (
        SELECT c.periodo
        FROM cuotas c
        WHERE c.id_condominio = $1
        GROUP BY c.periodo
        UNION
        SELECT to_char(g.fecha, 'YYYY-MM') AS periodo
        FROM gastos g
        WHERE g.id_condominio = $1
        GROUP BY 1
      ),
      cuotas_periodo AS (
        SELECT
          c.periodo,
          COUNT(*)::int AS cuotas,
          COUNT(*) FILTER (WHERE c.estado = 'PAGADA')::int AS cuotas_pagadas,
          COUNT(*) FILTER (WHERE c.estado <> 'PAGADA')::int AS cuotas_pendientes,
          COALESCE(SUM(c.monto_base), 0)::numeric AS facturado,
          COALESCE(SUM(c.monto_base) FILTER (WHERE c.estado <> 'PAGADA'), 0)::numeric AS adeudo_capital,
          COALESCE(SUM(
            CASE
              WHEN c.estado <> 'PAGADA'
              THEN c.recargo_por_dia * GREATEST(CURRENT_DATE - c.fecha_limite, 0)
              ELSE 0
            END
          ), 0)::numeric AS recargos_estimados
        FROM cuotas c
        WHERE c.id_condominio = $1
        GROUP BY c.periodo
      ),
      pagos_periodo AS (
        SELECT
          c.periodo,
          COUNT(*)::int AS pagos_validados,
          COALESCE(SUM(p.monto - COALESCE(p.monto_recargo, 0)), 0)::numeric AS cobrado_capital,
          COALESCE(SUM(COALESCE(p.monto_recargo, 0)), 0)::numeric AS recargos_cobrados
        FROM pagos p
        INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
        WHERE c.id_condominio = $1 AND p.estado = 'VALIDADO'
        GROUP BY c.periodo
      ),
      gastos_periodo AS (
        SELECT
          to_char(g.fecha, 'YYYY-MM') AS periodo,
          COUNT(*)::int AS gastos_registrados,
          COALESCE(SUM(g.monto), 0)::numeric AS gastos
        FROM gastos g
        WHERE g.id_condominio = $1
        GROUP BY 1
      ),
      comisiones_periodo AS (
        SELECT
          c.periodo,
          COALESCE(SUM(cc.monto_comision), 0)::numeric AS comisiones
        FROM cargos_cuota cc
        INNER JOIN cuotas c ON c.id_cuota = cc.id_cuota
        WHERE cc.id_condominio = $1
          AND cc.metodo = 'STRIPE'
          AND cc.estado = 'PAGADO'
        GROUP BY c.periodo
      )
      SELECT
        pe.periodo,
        COALESCE(cp.cuotas, 0) AS cuotas,
        COALESCE(cp.cuotas_pagadas, 0) AS cuotas_pagadas,
        COALESCE(cp.cuotas_pendientes, 0) AS cuotas_pendientes,
        COALESCE(cp.facturado, 0) AS facturado,
        COALESCE(cp.adeudo_capital, 0) AS adeudo_capital,
        COALESCE(cp.recargos_estimados, 0) AS recargos_estimados,
        COALESCE(pp.pagos_validados, 0) AS pagos_validados,
        COALESCE(pp.cobrado_capital, 0) AS cobrado_capital,
        COALESCE(pp.recargos_cobrados, 0) AS recargos_cobrados,
        COALESCE(gp.gastos_registrados, 0) AS gastos_registrados,
        COALESCE(gp.gastos, 0) AS gastos,
        COALESCE(cm.comisiones, 0) AS comisiones
      FROM periodos pe
      LEFT JOIN cuotas_periodo cp ON cp.periodo = pe.periodo
      LEFT JOIN pagos_periodo pp ON pp.periodo = pe.periodo
      LEFT JOIN gastos_periodo gp ON gp.periodo = pe.periodo
      LEFT JOIN comisiones_periodo cm ON cm.periodo = pe.periodo
      WHERE ($2::text[] IS NULL OR pe.periodo = ANY($2))
      ORDER BY pe.periodo DESC
      `,
      [idCondominio, periodosSolicitados],
    );

    const seriePeriodos = (serieRows as Array<Record<string, unknown>>).map((row) =>
      this.aPeriodoFinanciero(row, esAdmin),
    );

    const periodos = seriePeriodos.map((fila) => fila.periodo);
    const kpis = this.calcularKpis(seriePeriodos, esAdmin);

    const categoriaRows = await this.dataSource.query(
      `
      SELECT
        g.categoria,
        COALESCE(SUM(g.monto), 0)::numeric AS monto,
        COUNT(*)::int AS movimientos
      FROM gastos g
      WHERE g.id_condominio = $1
        AND ($2::text[] IS NULL OR to_char(g.fecha, 'YYYY-MM') = ANY($2))
      GROUP BY g.categoria
      ORDER BY monto DESC, g.categoria
      `,
      [idCondominio, periodosSolicitados],
    );

    const gastosPorCategoria = this.conPorcentaje(
      (categoriaRows as Array<Record<string, unknown>>).map((row) => ({
        categoria: String(row.categoria ?? 'Sin categoria'),
        monto: this.aCentavos(row.monto),
        movimientos: Number(row.movimientos ?? 0),
      })),
    );

    const metodoRows = await this.dataSource.query(
      `
      SELECT
        COALESCE(p.origen, 'COMPROBANTE') AS origen,
        COALESCE(SUM(p.monto), 0)::numeric AS monto,
        COALESCE(SUM(COALESCE(p.monto_recargo, 0)), 0)::numeric AS recargos,
        COUNT(*)::int AS pagos
      FROM pagos p
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      WHERE c.id_condominio = $1
        AND p.estado = 'VALIDADO'
        AND ($2::text[] IS NULL OR c.periodo = ANY($2))
      GROUP BY 1
      ORDER BY monto DESC
      `,
      [idCondominio, periodosSolicitados],
    );

    const totalMetodos = (metodoRows as Array<Record<string, unknown>>).reduce(
      (suma, row) => suma + this.aCentavos(row.monto),
      0,
    );

    const metodosPago: MetodoPagoResumen[] = (
      metodoRows as Array<Record<string, unknown>>
    ).map((row) => {
      const monto = this.aCentavos(row.monto);
      return {
        origen: (row.origen
          ? String(row.origen)
          : 'COMPROBANTE') as MetodoPagoResumen['origen'],
        monto,
        recargos: this.aCentavos(row.recargos),
        pagos: Number(row.pagos ?? 0),
        porcentaje: totalMetodos > 0 ? this.redondear((monto / totalMetodos) * 100) : 0,
      };
    });

    const antiguedadRows = await this.dataSource.query(
      `
      WITH pendientes AS (
        SELECT
          CASE
            WHEN c.fecha_limite >= CURRENT_DATE THEN 'POR_VENCER'
            WHEN CURRENT_DATE - c.fecha_limite <= 30 THEN 'D_1_30'
            WHEN CURRENT_DATE - c.fecha_limite <= 60 THEN 'D_31_60'
            WHEN CURRENT_DATE - c.fecha_limite <= 90 THEN 'D_61_90'
            ELSE 'MAS_90'
          END AS bucket,
          c.monto_base AS capital,
          c.recargo_por_dia * GREATEST(CURRENT_DATE - c.fecha_limite, 0) AS recargos
        FROM cuotas c
        WHERE c.id_condominio = $1
          AND c.estado <> 'PAGADA'
          AND ($2::text[] IS NULL OR c.periodo = ANY($2))
      )
      SELECT
        bucket,
        COUNT(*)::int AS cuotas,
        COALESCE(SUM(capital), 0)::numeric AS capital,
        COALESCE(SUM(recargos), 0)::numeric AS recargos
      FROM pendientes
      GROUP BY bucket
      `,
      [idCondominio, periodosSolicitados],
    );

    const antiguedadPorBucket = new Map<string, Record<string, unknown>>();
    for (const row of antiguedadRows as Array<Record<string, unknown>>) {
      antiguedadPorBucket.set(String(row.bucket), row);
    }

    const antiguedadAdeudos: AntiguedadAdeudo[] = BUCKETS.map(({ clave, etiqueta }) => {
      const row = antiguedadPorBucket.get(clave);
      return {
        bucket: clave,
        etiqueta,
        cuotas: Number(row?.cuotas ?? 0),
        capital: this.aCentavos(row?.capital),
        recargos: this.aCentavos(row?.recargos),
      };
    });

    /*
     * Cobranza por unidad: una sola consulta sirve para el administrador (todas
     * las unidades) y para el condomino (solo las suyas). `$3` filtra por
     * membresia cuando se pasa; el administrador lo deja en NULL.
     */
    const cobranzaRows = await this.dataSource.query(
      `
      SELECT
        u.id_unidad,
        u.clave_unidad,
        u.tipo_unidad,
        ocupante.nombre AS ocupante,
        COUNT(c.id_cuota)::int AS cuotas,
        COUNT(*) FILTER (WHERE c.estado <> 'PAGADA')::int AS cuotas_pendientes,
        COALESCE(SUM(c.monto_base), 0)::numeric AS facturado,
        COALESCE(SUM(c.monto_base) FILTER (WHERE c.estado <> 'PAGADA'), 0)::numeric AS adeudo_capital,
        COALESCE(SUM(
          CASE
            WHEN c.estado <> 'PAGADA'
            THEN c.recargo_por_dia * GREATEST(CURRENT_DATE - c.fecha_limite, 0)
            ELSE 0
          END
        ), 0)::numeric AS recargos_estimados,
        COALESCE(MAX(
          CASE
            WHEN c.estado <> 'PAGADA'
            THEN GREATEST(CURRENT_DATE - c.fecha_limite, 0)
            ELSE 0
          END
        ), 0)::int AS dias_atraso_max,
        COALESCE(SUM(p.monto - COALESCE(p.monto_recargo, 0))
          FILTER (WHERE p.estado = 'VALIDADO'), 0)::numeric AS cobrado_capital,
        COALESCE(SUM(COALESCE(p.monto_recargo, 0))
          FILTER (WHERE p.estado = 'VALIDADO'), 0)::numeric AS recargos_cobrados
      FROM cuotas c
      INNER JOIN unidades u ON u.id_unidad = c.id_unidad
      LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
      LEFT JOIN LATERAL (
        SELECT trim(concat_ws(' ', us.nombre, us.primer_apellido, us.segundo_apellido)) AS nombre
        FROM unidades_ocupantes uo
        INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = uo.id_usuario_condominio
        INNER JOIN usuarios us ON us.id_usuario = uc.id_usuario
        WHERE uo.id_unidad = u.id_unidad
          AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
        ORDER BY
          CASE uo.tipo_ocupacion
            WHEN 'PROPIETARIO' THEN 0
            WHEN 'INQUILINO' THEN 1
            ELSE 2
          END,
          uo.fecha_inicio DESC
        LIMIT 1
      ) ocupante ON TRUE
      WHERE c.id_condominio = $1
        AND ($2::text[] IS NULL OR c.periodo = ANY($2))
        AND ($3::int IS NULL OR u.id_unidad IN (
          SELECT uo2.id_unidad
          FROM unidades_ocupantes uo2
          WHERE uo2.id_usuario_condominio = $3
        ))
      GROUP BY u.id_unidad, u.clave_unidad, u.tipo_unidad, ocupante.nombre
      /*
       * Dos criterios:
       *  1. Primero las unidades con adeudo, despues las que estan al corriente.
       *  2. Dentro de cada grupo, ORDEN NATURAL de la unidad. Postgres ordenaba
       *     clave_unidad como texto y salia 1, 10, 11, ..., 2, 20, 3. Se separa
       *     el prefijo (Depto, A-) del primer numero, igual que en
       *     condominos.service.ts, para que 2 quede antes que 10.
       */
      ORDER BY
        (COUNT(*) FILTER (WHERE c.estado <> 'PAGADA') > 0) DESC,
        substring(u.clave_unidad from '^[^0-9]*') ASC,
        NULLIF(substring(u.clave_unidad from '[0-9]+'), '')::int ASC NULLS LAST,
        u.clave_unidad ASC
      `,
      [
        idCondominio,
        periodosSolicitados,
        esAdmin ? null : opciones.idUsuarioCondominio,
      ],
    );

    const cobranza = (cobranzaRows as Array<Record<string, unknown>>).map((row) =>
      this.aCobranzaUnidad(row),
    );

    const unidadesActivasRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM unidades WHERE id_condominio = $1 AND estado = 'ACTIVA'`,
      [idCondominio],
    );
    const unidadesActivas = Number(
      (unidadesActivasRows as Array<Record<string, unknown>>)[0]?.total ?? 0,
    );

    kpis.unidadesActivas = unidadesActivas;
    kpis.unidadesConAdeudo = cobranza.filter((unidad) => unidad.adeudoTotal > 0).length;

    const pagosRows = await this.dataSource.query(
      `
      SELECT
        p.id_pago,
        c.periodo,
        c.tipo,
        u.clave_unidad,
        p.monto,
        COALESCE(p.monto_recargo, 0) AS monto_recargo,
        p.fecha_pago,
        p.estado,
        COALESCE(p.origen, 'COMPROBANTE') AS origen,
        p.referencia
      FROM pagos p
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      LEFT JOIN unidades u ON u.id_unidad = c.id_unidad
      WHERE c.id_condominio = $1
        AND ($2::text[] IS NULL OR c.periodo = ANY($2))
        AND ($3::int IS NULL OR p.id_usuario_condominio_paga = $3)
      ORDER BY p.fecha_pago DESC
      `,
      [
        idCondominio,
        periodosSolicitados,
        esAdmin ? null : opciones.idUsuarioCondominio,
      ],
    );

    const gastosRows = await this.dataSource.query(
      `
      SELECT g.id_gasto, g.concepto, g.categoria, g.monto, g.fecha, g.proveedor
      FROM gastos g
      WHERE g.id_condominio = $1
        AND ($2::text[] IS NULL OR to_char(g.fecha, 'YYYY-MM') = ANY($2))
      ORDER BY g.fecha DESC
      `,
      [idCondominio, periodosSolicitados],
    );

    const movimientos: { pagos: MovimientoPago[]; gastos: MovimientoGasto[] } = {
      pagos: this.deduplicarPagos(pagosRows as Array<Record<string, unknown>>),
      gastos: (gastosRows as Array<Record<string, unknown>>).map((row) => ({
        idGasto: Number(row.id_gasto),
        concepto: String(row.concepto ?? ''),
        categoria: String(row.categoria ?? ''),
        monto: this.aCentavos(row.monto),
        fecha: this.aIso(row.fecha),
        proveedor: row.proveedor ? String(row.proveedor) : null,
      })),
    };

    const resumen: ReporteFinancieroResumen = {
      idCondominio,
      condominio: {
        nombre: String(condominioRow.nombre ?? ''),
        direccion: condominioRow.direccion ? String(condominioRow.direccion) : null,
        rfc: condominioRow.rfc ? String(condominioRow.rfc) : null,
        razonSocial: condominioRow.razon_social ? String(condominioRow.razon_social) : null,
        correoContacto: condominioRow.correo_contacto
          ? String(condominioRow.correo_contacto)
          : null,
        telefonoContacto: condominioRow.telefono_contacto
          ? String(condominioRow.telefono_contacto)
          : null,
      },
      rol: opciones.rol,
      generadoEn: new Date().toISOString(),
      periodos,
      periodosDisponibles,
      kpis,
      seriePeriodos,
      gastosPorCategoria,
      metodosPago,
      antiguedadAdeudos,
      movimientos,
    };

    if (esAdmin) {
      resumen.cobranzaPorUnidad = cobranza;
      /*
       * `cobranza` ya viene en orden natural, asi que hay que elegir a los
       * deudores ANTES de reordenar: cortar los primeros 10 de la lista daria
       * las unidades 1..10, no las de mayor adeudo.
       */
      resumen.topDeudores = cobranza
        .filter((unidad) => unidad.adeudoTotal > 0)
        .sort(
          (a, b) =>
            b.adeudoTotal - a.adeudoTotal ||
            this.compararUnidadNatural(a.claveUnidad, b.claveUnidad),
        )
        .slice(0, 10)
        .sort((a, b) => this.compararUnidadNatural(a.claveUnidad, b.claveUnidad));
    } else {
      resumen.miUnidad = this.agregarMiUnidad(cobranza);
    }

    return resumen;
  }

  /**
   * Orden natural de claves de unidad (`1`, `2`, `10` en vez de `1`, `10`, `2`).
   *
   * Replica la regla del `ORDER BY` de la cobranza: prefijo sin numeros, luego
   * el primer numero. Se usa para reordenar el top de deudores, que se elige
   * por monto y no por clave.
   */
  private compararUnidadNatural(a: string, b: string): number {
    const descomponer = (clave: string) => ({
      prefijo: (/^[^0-9]*/.exec(clave) ?? [''])[0],
      numero: (() => {
        const digitos = (/[0-9]+/.exec(clave) ?? [''])[0];
        return digitos ? Number(digitos) : null;
      })(),
    });

    const izquierda = descomponer(a);
    const derecha = descomponer(b);

    const porPrefijo = izquierda.prefijo.localeCompare(derecha.prefijo, 'es', {
      sensitivity: 'base',
    });
    if (porPrefijo !== 0) {
      return porPrefijo;
    }

    // Mismo criterio que `NULLS LAST`: una unidad sin numero va al final.
    if (izquierda.numero === null && derecha.numero !== null) {
      return 1;
    }
    if (izquierda.numero !== null && derecha.numero === null) {
      return -1;
    }
    if (
      izquierda.numero !== null &&
      derecha.numero !== null &&
      izquierda.numero !== derecha.numero
    ) {
      return izquierda.numero - derecha.numero;
    }

    return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
  }

  /** Periodos `YYYY-MM` validos, sin duplicados y con tope de 60. */
  private normalizarPeriodos(valor: string[] | null): string[] | null {
    if (!valor || valor.length === 0) {
      return null;
    }

    const validos = Array.from(
      new Set(
        valor
          .flatMap((item) => String(item).split(','))
          .map((item) => item.trim())
          .filter((item) => /^\d{4}-(0[1-9]|1[0-2])$/.test(item)),
      ),
    );

    return validos.length > 0 ? validos.slice(0, 60) : null;
  }

  private aPeriodoFinanciero(
    row: Record<string, unknown>,
    esAdmin: boolean,
  ): PeriodoFinanciero {
    const facturado = this.aCentavos(row.facturado);
    const cobradoCapital = this.aCentavos(row.cobrado_capital);
    const recargosCobrados = this.aCentavos(row.recargos_cobrados);
    const gastos = this.aCentavos(row.gastos);
    const comisiones = esAdmin ? this.aCentavos(row.comisiones) : 0;
    const ingresosTotales = this.aCentavos(cobradoCapital + recargosCobrados);
    const adeudoCapital = this.aCentavos(row.adeudo_capital);
    const recargosEstimados = this.aCentavos(row.recargos_estimados);

    return {
      periodo: String(row.periodo),
      facturado,
      cobradoCapital,
      recargosCobrados,
      ingresosTotales,
      gastos,
      comisiones,
      balanceNeto: this.aCentavos(ingresosTotales - gastos - comisiones),
      adeudoCapital,
      recargosEstimados,
      adeudoTotal: this.aCentavos(adeudoCapital + recargosEstimados),
      tasaCobranza: facturado > 0 ? this.redondear(cobradoCapital / facturado) : 0,
      cuotas: Number(row.cuotas ?? 0),
      cuotasPagadas: Number(row.cuotas_pagadas ?? 0),
      cuotasPendientes: Number(row.cuotas_pendientes ?? 0),
      pagosValidados: Number(row.pagos_validados ?? 0),
      gastosRegistrados: Number(row.gastos_registrados ?? 0),
    };
  }

  private calcularKpis(serie: PeriodoFinanciero[], esAdmin: boolean): KpisReporte {
    const total = serie.reduce(
      (acc, fila) => ({
        facturado: acc.facturado + fila.facturado,
        cobradoCapital: acc.cobradoCapital + fila.cobradoCapital,
        recargosCobrados: acc.recargosCobrados + fila.recargosCobrados,
        ingresosTotales: acc.ingresosTotales + fila.ingresosTotales,
        gastos: acc.gastos + fila.gastos,
        comisiones: acc.comisiones + fila.comisiones,
        adeudoCapital: acc.adeudoCapital + fila.adeudoCapital,
        recargosEstimados: acc.recargosEstimados + fila.recargosEstimados,
        cuotasPendientes: acc.cuotasPendientes + fila.cuotasPendientes,
      }),
      {
        facturado: 0,
        cobradoCapital: 0,
        recargosCobrados: 0,
        ingresosTotales: 0,
        gastos: 0,
        comisiones: 0,
        adeudoCapital: 0,
        recargosEstimados: 0,
        cuotasPendientes: 0,
      },
    );

    const facturado = this.aCentavos(total.facturado);
    const cobradoCapital = this.aCentavos(total.cobradoCapital);
    const recargosCobrados = this.aCentavos(total.recargosCobrados);
    const ingresosTotales = this.aCentavos(cobradoCapital + recargosCobrados);
    const gastos = this.aCentavos(total.gastos);
    const comisiones = esAdmin ? this.aCentavos(total.comisiones) : 0;
    const adeudoCapital = this.aCentavos(total.adeudoCapital);
    const recargosEstimados = this.aCentavos(total.recargosEstimados);

    return {
      periodos: serie.length,
      facturado,
      cobradoCapital,
      recargosCobrados,
      ingresosTotales,
      gastos,
      comisiones,
      balanceNeto: this.aCentavos(ingresosTotales - gastos - comisiones),
      adeudoCapital,
      recargosEstimados,
      adeudoTotal: this.aCentavos(adeudoCapital + recargosEstimados),
      tasaCobranza: facturado > 0 ? this.redondear(cobradoCapital / facturado) : 0,
      unidadesActivas: 0,
      unidadesConAdeudo: 0,
      cuotasPendientes: total.cuotasPendientes,
    };
  }

  /** Agrega `porcentaje` a cada categoria respecto del gasto total. */
  private conPorcentaje(
    filas: Array<{ categoria: string; monto: number; movimientos: number }>,
  ): CategoriaGasto[] {
    const total = filas.reduce((suma, fila) => suma + fila.monto, 0);
    return filas.map((fila) => ({
      ...fila,
      porcentaje: total > 0 ? this.redondear((fila.monto / total) * 100) : 0,
    }));
  }

  private aCobranzaUnidad(row: Record<string, unknown>): CobranzaUnidad {
    const cuotasPendientes = Number(row.cuotas_pendientes ?? 0);
    const diasAtrasoMax = Number(row.dias_atraso_max ?? 0);
    const adeudoCapital = this.aCentavos(row.adeudo_capital);
    const recargosEstimados = this.aCentavos(row.recargos_estimados);

    return {
      idUnidad: Number(row.id_unidad),
      claveUnidad: String(row.clave_unidad ?? ''),
      tipoUnidad: String(row.tipo_unidad ?? ''),
      ocupante: row.ocupante ? String(row.ocupante) : null,
      facturado: this.aCentavos(row.facturado),
      cobradoCapital: this.aCentavos(row.cobrado_capital),
      recargosCobrados: this.aCentavos(row.recargos_cobrados),
      adeudoCapital,
      recargosEstimados,
      adeudoTotal: this.aCentavos(adeudoCapital + recargosEstimados),
      cuotas: Number(row.cuotas ?? 0),
      cuotasPendientes,
      diasAtrasoMax,
      estado: this.estadoCobranza(cuotasPendientes, diasAtrasoMax),
    };
  }

  private estadoCobranza(
    cuotasPendientes: number,
    diasAtrasoMax: number,
  ): EstadoCobranzaUnidad {
    if (cuotasPendientes === 0) {
      return 'AL_CORRIENTE';
    }
    return diasAtrasoMax > 0 ? 'VENCIDO' : 'PENDIENTE';
  }

  /** Suma las unidades del condomino en un solo bloque. */
  private agregarMiUnidad(unidades: CobranzaUnidad[]): MiUnidadResumen | null {
    if (unidades.length === 0) {
      return null;
    }

    const resumen = unidades.reduce(
      (acc, unidad) => ({
        facturado: acc.facturado + unidad.facturado,
        cobradoCapital: acc.cobradoCapital + unidad.cobradoCapital,
        recargosCobrados: acc.recargosCobrados + unidad.recargosCobrados,
        adeudoCapital: acc.adeudoCapital + unidad.adeudoCapital,
        recargosEstimados: acc.recargosEstimados + unidad.recargosEstimados,
        cuotas: acc.cuotas + unidad.cuotas,
        cuotasPendientes: acc.cuotasPendientes + unidad.cuotasPendientes,
        diasAtrasoMax: Math.max(acc.diasAtrasoMax, unidad.diasAtrasoMax),
      }),
      {
        facturado: 0,
        cobradoCapital: 0,
        recargosCobrados: 0,
        adeudoCapital: 0,
        recargosEstimados: 0,
        cuotas: 0,
        cuotasPendientes: 0,
        diasAtrasoMax: 0,
      },
    );

    const adeudoCapital = this.aCentavos(resumen.adeudoCapital);
    const recargosEstimados = this.aCentavos(resumen.recargosEstimados);

    return {
      clavesUnidad: unidades.map((unidad) => unidad.claveUnidad),
      facturado: this.aCentavos(resumen.facturado),
      cobradoCapital: this.aCentavos(resumen.cobradoCapital),
      recargosCobrados: this.aCentavos(resumen.recargosCobrados),
      adeudoCapital,
      recargosEstimados,
      adeudoTotal: this.aCentavos(adeudoCapital + recargosEstimados),
      cuotas: resumen.cuotas,
      cuotasPendientes: resumen.cuotasPendientes,
      diasAtrasoMax: resumen.diasAtrasoMax,
      estado: this.estadoCobranza(resumen.cuotasPendientes, resumen.diasAtrasoMax),
    };
  }

  /**
   * Quita pagos repetidos del listado de movimientos.
   *
   * La consulta une `pagos` con `cuotas` por una relacion 1:1 (`id_cuota` es
   * UNIQUE en `pagos`), pero se protege por si en el futuro se agrega un join
   * que multiplique filas: un movimiento duplicado en el Excel es un error
   * caro de detectar.
   */
  private deduplicarPagos(rows: Array<Record<string, unknown>>): MovimientoPago[] {
    const vistos = new Set<number>();
    const movimientos: MovimientoPago[] = [];

    for (const row of rows) {
      const idPago = Number(row.id_pago);
      if (vistos.has(idPago)) {
        continue;
      }
      vistos.add(idPago);
      movimientos.push({
        idPago,
        periodo: String(row.periodo ?? ''),
        tipo: String(row.tipo ?? ''),
        claveUnidad: row.clave_unidad ? String(row.clave_unidad) : null,
        monto: this.aCentavos(row.monto),
        montoRecargo: this.aCentavos(row.monto_recargo),
        fechaPago: this.aIso(row.fecha_pago),
        estado: String(row.estado ?? 'CAPTURADO') as MovimientoPago['estado'],
        origen: (row.origen
          ? String(row.origen)
          : 'COMPROBANTE') as MovimientoPago['origen'],
        referencia: row.referencia ? String(row.referencia) : null,
      });
    }

    return movimientos;
  }

  private redondear(valor: number): number {
    return Number.isFinite(valor) ? Math.round(valor * 1000) / 1000 : 0;
  }

  private aIso(valor: unknown): string {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      return valor.toISOString();
    }
    const fecha = new Date(String(valor ?? ''));
    return Number.isNaN(fecha.getTime()) ? new Date().toISOString() : fecha.toISOString();
  }

  /** Redondeo a centavos: la formula vive en `common/dinero/recargos.ts`. */
  private aCentavos(valor: unknown): number {
    return aCentavos(valor);
  }
}