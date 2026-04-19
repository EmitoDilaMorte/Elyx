import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type ReporteFinancieroRecord = {
  idCondominio: number;
  periodo: string;
  ingresos: number;
  gastos: number;
  adeudos: number;
};

@Injectable()
export class ReportesFinancierosService {
  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(idCondominio: number): Promise<ReporteFinancieroRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id_condominio,
        periodo,
        total_ingresos,
        total_gastos,
        total_adeudos
      FROM reportes_financieros
      WHERE id_condominio = $1
      ORDER BY fecha_generacion DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => ({
      idCondominio: Number(row.id_condominio),
      periodo: String(row.periodo),
      ingresos: Number(row.total_ingresos),
      gastos: Number(row.total_gastos),
      adeudos: Number(row.total_adeudos),
    }));
  }
}