import { Injectable } from '@nestjs/common';

type ReporteFinancieroRecord = {
  idCondominio: number;
  periodo: string;
  ingresos: number;
  gastos: number;
  adeudos: number;
};

@Injectable()
export class ReportesFinancierosService {
  private readonly reportes: ReporteFinancieroRecord[] = [
    { idCondominio: 101, periodo: 'Enero 2026', ingresos: 92500, gastos: 23300, adeudos: 10400 },
    { idCondominio: 101, periodo: 'Febrero 2026', ingresos: 91150, gastos: 27500, adeudos: 12200 },
    { idCondominio: 202, periodo: 'Enero 2026', ingresos: 68100, gastos: 20100, adeudos: 8600 },
    { idCondominio: 202, periodo: 'Febrero 2026', ingresos: 70400, gastos: 21950, adeudos: 9100 },
  ];

  listByCondominio(idCondominio: number): ReporteFinancieroRecord[] {
    return this.reportes.filter((item) => item.idCondominio === idCondominio);
  }
}