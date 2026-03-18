import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateReporteMantenimientoDto,
  ReporteMantenimientoEstado,
  UpdateReporteMantenimientoEstadoDto,
} from './dto/reportes-mantenimiento.dto';

type ReporteMantenimientoRecord = {
  idReporte: number;
  idCondominio: number;
  unidad: string;
  descripcion: string;
  fecha: string;
  estado: ReporteMantenimientoEstado;
  idUsuarioCondominioReporta: number;
  idUsuarioCondominioAdmin: number | null;
};

@Injectable()
export class ReportesMantenimientoService {
  private nextReporteId = 100;

  private readonly reportes: ReporteMantenimientoRecord[] = [
    {
      idReporte: 90,
      idCondominio: 101,
      unidad: 'Pasillo B',
      descripcion: 'Fuga en pasillo del edificio B',
      fecha: '2026-03-16T10:00:00.000Z',
      estado: ReporteMantenimientoEstado.EN_PROCESO,
      idUsuarioCondominioReporta: 1001,
      idUsuarioCondominioAdmin: 2001,
    },
    {
      idReporte: 91,
      idCondominio: 202,
      unidad: 'Lobby Torre 2',
      descripcion: 'Puerta automatica con falla intermitente',
      fecha: '2026-03-17T09:00:00.000Z',
      estado: ReporteMantenimientoEstado.NUEVO,
      idUsuarioCondominioReporta: 1002,
      idUsuarioCondominioAdmin: null,
    },
  ];

  listByCondominio(idCondominio: number): ReporteMantenimientoRecord[] {
    return this.reportes
      .filter((item) => item.idCondominio === idCondominio)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  create(input: CreateReporteMantenimientoDto): ReporteMantenimientoRecord {
    const reporte: ReporteMantenimientoRecord = {
      idReporte: this.nextReporteId,
      idCondominio: input.idCondominio,
      unidad: input.unidad.trim(),
      descripcion: input.descripcion.trim(),
      fecha: new Date().toISOString(),
      estado: ReporteMantenimientoEstado.NUEVO,
      idUsuarioCondominioReporta: input.idUsuarioCondominioReporta,
      idUsuarioCondominioAdmin: null,
    };

    this.nextReporteId += 1;
    this.reportes.unshift(reporte);
    return reporte;
  }

  updateEstado(input: UpdateReporteMantenimientoEstadoDto): ReporteMantenimientoRecord {
    const reporte = this.reportes.find(
      (item) => item.idCondominio === input.idCondominio && item.idReporte === input.idReporte,
    );

    if (!reporte) {
      throw new NotFoundException('No se encontro el reporte de mantenimiento para el condominio indicado.');
    }

    reporte.estado = input.estado;
    reporte.idUsuarioCondominioAdmin = input.idUsuarioCondominioAdmin;
    return reporte;
  }
}