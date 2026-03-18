import { Injectable } from '@nestjs/common';
import { CreateGastoDto } from './dto/create-gasto.dto';

type GastoRecord = {
  idGasto: number;
  idCondominio: number;
  concepto: string;
  categoria: string;
  monto: number;
  fecha: string;
};

@Injectable()
export class GastosService {
  private nextGastoId = 4;

  private readonly gastos: GastoRecord[] = [
    { idGasto: 1, idCondominio: 101, concepto: 'Jardineria', categoria: 'Servicios', monto: 5400, fecha: '2026-03-08T12:00:00.000Z' },
    {
      idGasto: 2,
      idCondominio: 101,
      concepto: 'Mantenimiento elevador',
      categoria: 'Mantenimiento',
      monto: 9100,
      fecha: '2026-03-11T12:00:00.000Z',
    },
    { idGasto: 3, idCondominio: 202, concepto: 'Limpieza de alberca', categoria: 'Servicios', monto: 4700, fecha: '2026-03-10T12:00:00.000Z' },
  ];

  listByCondominio(idCondominio: number): GastoRecord[] {
    return this.gastos
      .filter((item) => item.idCondominio === idCondominio)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  create(input: CreateGastoDto): GastoRecord {
    const gasto: GastoRecord = {
      idGasto: this.nextGastoId,
      idCondominio: input.idCondominio,
      concepto: input.concepto.trim(),
      categoria: input.categoria.trim(),
      monto: input.monto,
      fecha: new Date().toISOString(),
    };

    this.nextGastoId += 1;
    this.gastos.unshift(gasto);
    return gasto;
  }
}