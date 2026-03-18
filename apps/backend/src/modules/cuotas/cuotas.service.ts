import { Injectable, NotFoundException } from '@nestjs/common';

export type CuotaEstado = 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';

type CuotaRecord = {
  idCuota: number;
  idCondominio: number;
  periodo: string;
  monto: number;
  fechaLimite: string;
  recargo: number;
  estado: CuotaEstado;
};

@Injectable()
export class CuotasService {
  private readonly cuotas: CuotaRecord[] = [
    { idCuota: 1, idCondominio: 101, periodo: 'Marzo 2026', monto: 1850, fechaLimite: '2026-03-20', recargo: 50, estado: 'PENDIENTE' },
    { idCuota: 2, idCondominio: 101, periodo: 'Abril 2026', monto: 1850, fechaLimite: '2026-04-20', recargo: 0, estado: 'PENDIENTE' },
    { idCuota: 3, idCondominio: 202, periodo: 'Marzo 2026', monto: 1650, fechaLimite: '2026-03-21', recargo: 30, estado: 'PENDIENTE' },
    { idCuota: 4, idCondominio: 202, periodo: 'Abril 2026', monto: 1650, fechaLimite: '2026-04-21', recargo: 0, estado: 'PENDIENTE' },
  ];

  listByCondominio(idCondominio: number): CuotaRecord[] {
    return this.cuotas.filter((item) => item.idCondominio === idCondominio);
  }

  findByCondominioAndId(idCondominio: number, idCuota: number): CuotaRecord {
    const cuota = this.cuotas.find((item) => item.idCondominio === idCondominio && item.idCuota === idCuota);
    if (!cuota) {
      throw new NotFoundException('No se encontro la cuota para el condominio indicado.');
    }
    return cuota;
  }

  markEnValidacion(idCondominio: number, idCuota: number): void {
    const cuota = this.findByCondominioAndId(idCondominio, idCuota);
    cuota.estado = 'EN_VALIDACION';
  }

  markPagada(idCondominio: number, idCuota: number): void {
    const cuota = this.findByCondominioAndId(idCondominio, idCuota);
    cuota.estado = 'PAGADA';
    cuota.recargo = 0;
  }

  markPendiente(idCondominio: number, idCuota: number): void {
    const cuota = this.findByCondominioAndId(idCondominio, idCuota);
    cuota.estado = 'PENDIENTE';
  }
}