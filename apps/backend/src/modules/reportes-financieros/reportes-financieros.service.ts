import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CuotasService } from '../cuotas/cuotas.service';

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

  /** Redondeo a centavos: evita 1834.9999999 en importes de dinero. */
  private aCentavos(valor: unknown): number {
    const numero = Number(valor ?? 0);
    return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
  }
}