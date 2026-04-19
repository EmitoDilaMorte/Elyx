import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateReporteMantenimientoDto,
  ReporteMantenimientoEstado,
  UpdateReporteMantenimientoEstadoDto,
} from './dto/reportes-mantenimiento.dto';
import { DataSource } from 'typeorm';
import { ReportesMantenimientoGateway } from './reportes-mantenimiento.gateway';

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
  constructor(
    private readonly dataSource: DataSource,
    private readonly reportesMantenimientoGateway: ReportesMantenimientoGateway,
  ) {}

  async listByCondominio(idCondominio: number): Promise<ReporteMantenimientoRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id_reporte,
        id_condominio,
        descripcion,
        fecha_reporte,
        estado,
        id_usuario_condominio_reporta,
        id_usuario_condominio_admin
      FROM reportes_mantenimiento
      WHERE id_condominio = $1
      ORDER BY fecha_reporte DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown> | unknown[]) => this.toReporteRecord(row));
  }

  async create(input: CreateReporteMantenimientoDto): Promise<ReporteMantenimientoRecord> {
    const rows = await this.dataSource.query(
      `
      INSERT INTO reportes_mantenimiento (
        descripcion,
        fecha_reporte,
        estado,
        comentario_admin,
        id_condominio,
        id_usuario_condominio_reporta,
        id_usuario_condominio_admin
      )
      VALUES ($1, NOW(), 'ABIERTO', NULL, $2, $3, NULL)
      RETURNING
        id_reporte,
        id_condominio,
        descripcion,
        fecha_reporte,
        estado,
        id_usuario_condominio_reporta,
        id_usuario_condominio_admin
      `,
      [`${input.unidad.trim()}: ${input.descripcion.trim()}`, input.idCondominio, input.idUsuarioCondominioReporta],
    );

    const reporte = this.toReporteRecord(rows[0] as Record<string, unknown> | unknown[]);
    this.reportesMantenimientoGateway.emitMantenimientoChanged(input.idCondominio, {
      tipo: 'CREADO',
      reporte,
    });
    return reporte;
  }

  async updateEstado(input: UpdateReporteMantenimientoEstadoDto): Promise<ReporteMantenimientoRecord> {
    const result = await this.dataSource.query(
      `
      UPDATE reportes_mantenimiento
      SET estado = $1,
          id_usuario_condominio_admin = $2
      WHERE id_condominio = $3 AND id_reporte = $4
      `,
      [this.toDbEstado(input.estado), input.idUsuarioCondominioAdmin, input.idCondominio, input.idReporte],
    );

    if (!result || (typeof result.rowCount === 'number' && result.rowCount === 0)) {
      throw new NotFoundException('No se encontro el reporte de mantenimiento para el condominio indicado.');
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        id_reporte,
        id_condominio,
        descripcion,
        fecha_reporte,
        estado,
        id_usuario_condominio_reporta,
        id_usuario_condominio_admin
      FROM reportes_mantenimiento
      WHERE id_condominio = $1 AND id_reporte = $2
      LIMIT 1
      `,
      [input.idCondominio, input.idReporte],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new NotFoundException('No se encontro el reporte de mantenimiento para el condominio indicado.');
    }

    const reporte = this.toReporteRecord(rows[0] as Record<string, unknown> | unknown[]);
    this.reportesMantenimientoGateway.emitMantenimientoChanged(input.idCondominio, {
      tipo: 'ACTUALIZADO',
      reporte,
    });
    return reporte;
  }

  private toReporteRecord(row: Record<string, unknown> | unknown[]): ReporteMantenimientoRecord {
    if (Array.isArray(row)) {
      const [idReporte, idCondominio, descripcion, fecha, estado, idReporta, idAdmin] = row;
      const descripcionRaw = String(descripcion ?? 'General');
      const separator = descripcionRaw.indexOf(': ');

      return {
        idReporte: Number(idReporte ?? 0),
        idCondominio: Number(idCondominio ?? 0),
        unidad: separator > -1 ? descripcionRaw.slice(0, separator) : 'General',
        descripcion: separator > -1 ? descripcionRaw.slice(separator + 2) : descripcionRaw,
        fecha: this.toIsoDate(fecha),
        estado: this.toApiEstado(String(estado ?? 'ABIERTO')),
        idUsuarioCondominioReporta: Number(idReporta ?? 0),
        idUsuarioCondominioAdmin: idAdmin ? Number(idAdmin) : null,
      };
    }

    const descripcionRaw = String(this.pick(row, ['descripcion']) ?? 'General');
    const separator = descripcionRaw.indexOf(': ');
    const estadoRaw = String(this.pick(row, ['estado']) ?? 'ABIERTO');

    return {
      idReporte: Number(this.pick(row, ['id_reporte', 'idReporte']) ?? 0),
      idCondominio: Number(this.pick(row, ['id_condominio', 'idCondominio']) ?? 0),
      unidad: separator > -1 ? descripcionRaw.slice(0, separator) : 'General',
      descripcion: separator > -1 ? descripcionRaw.slice(separator + 2) : descripcionRaw,
      fecha: this.toIsoDate(this.pick(row, ['fecha_reporte', 'fechaReporte', 'fecha'])),
      estado: this.toApiEstado(estadoRaw),
      idUsuarioCondominioReporta: Number(this.pick(row, ['id_usuario_condominio_reporta', 'idUsuarioCondominioReporta']) ?? 0),
      idUsuarioCondominioAdmin: this.pick(row, ['id_usuario_condominio_admin', 'idUsuarioCondominioAdmin'])
        ? Number(this.pick(row, ['id_usuario_condominio_admin', 'idUsuarioCondominioAdmin']))
        : null,
    };
  }

  private pick(row: Record<string, unknown>, keys: string[]): unknown {
    const normalize = (value: string) => value.toLowerCase().replace(/[_\s]/g, '');

    for (const key of keys) {
      if (row[key] !== undefined) {
        return row[key];
      }
    }

    const normalizedEntries = Object.entries(row).map(([rawKey, rawValue]) => ({
      key: normalize(rawKey),
      value: rawValue,
    }));

    for (const key of keys) {
      const found = normalizedEntries.find((entry) => entry.key === normalize(key));
      if (found && found.value !== undefined) {
        return found.value;
      }
    }

    return undefined;
  }

  private toIsoDate(value: unknown): string {
    try {
      if (value instanceof Date) {
        if (!Number.isNaN(value.getTime())) {
          return value.toISOString();
        }
        return new Date().toISOString();
      }

      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }

      return new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  private toApiEstado(estadoDb: string): ReporteMantenimientoEstado {
    if (estadoDb === 'ABIERTO') {
      return ReporteMantenimientoEstado.NUEVO;
    }

    if (estadoDb === 'EN_PROCESO') {
      return ReporteMantenimientoEstado.EN_PROCESO;
    }

    return ReporteMantenimientoEstado.RESUELTO;
  }

  private toDbEstado(estadoApi: ReporteMantenimientoEstado): string {
    if (estadoApi === ReporteMantenimientoEstado.NUEVO) {
      return 'ABIERTO';
    }

    if (estadoApi === ReporteMantenimientoEstado.EN_PROCESO) {
      return 'EN_PROCESO';
    }

    return 'RESUELTO';
  }
}