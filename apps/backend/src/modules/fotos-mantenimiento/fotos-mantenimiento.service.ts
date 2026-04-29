import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { join } from 'path';
import { CreateFotoMantenimientoDto } from './dto/create-foto-mantenimiento.dto';
import { ReportesMantenimientoGateway } from '../reportes-mantenimiento/reportes-mantenimiento.gateway';

type FotoMantenimientoRecord = {
  idFoto: number;
  idReporte: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
  tipo: 'REPORTE' | 'RESOLUCION';
};

@Injectable()
export class FotosMantenimientoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reportesMantenimientoGateway: ReportesMantenimientoGateway,
  ) {}

  private getPublicFilesBaseUrl(): string {
    const configured = process.env.PUBLIC_FILES_BASE_URL?.trim();
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    return 'http://localhost:3000';
  }

  async listByCondominio(idCondominio: number, idReporte?: number): Promise<FotoMantenimientoRecord[]> {
    const params: Array<number> = [idCondominio];
    let reporteClause = '';

    if (idReporte) {
      params.push(idReporte);
      reporteClause = ` AND f.id_reporte = $${params.length}`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        f.id_foto,
        f.id_reporte,
        r.id_condominio,
        f.nombre_archivo,
        f.url_archivo,
        f.fecha_carga,
        f.tipo
      FROM fotos_mantenimiento f
      INNER JOIN reportes_mantenimiento r ON r.id_reporte = f.id_reporte
      WHERE r.id_condominio = $1${reporteClause}
      ORDER BY f.fecha_carga DESC
      `,
      params,
    );

    return rows.map((row: Record<string, unknown>) => this.toRecord(row));
  }

  async create(input: CreateFotoMantenimientoDto, archivo: Express.Multer.File): Promise<FotoMantenimientoRecord> {
    return this.dataSource.transaction(async (manager) => {
      const safeFilename = archivo.filename;
      if (!safeFilename) {
        throw new BadRequestException('No fue posible guardar el archivo de foto.');
      }

      const baseUrl = this.getPublicFilesBaseUrl();
      const subDir = input.tipo === 'RESOLUCION' ? 'reparaciones' : 'incidencias';
      const urlArchivo = `${baseUrl}/uploads/${subDir}/${safeFilename}`;

      const reporteRows = await manager.query(
        `
        SELECT r.id_reporte, r.id_condominio, r.estado
        FROM reportes_mantenimiento r
        WHERE r.id_reporte = $1 AND r.id_condominio = $2
        LIMIT 1
        `,
        [input.idReporte, input.idCondominio],
      );

      if (reporteRows.length === 0) {
        throw new NotFoundException('No se encontro el reporte de mantenimiento para el condominio indicado.');
      }

      const estadoReporte = String((reporteRows[0] as Record<string, unknown>).estado);

      if (input.tipo === 'REPORTE') {
        if (estadoReporte !== 'ABIERTO') {
          throw new ForbiddenException('Solo se pueden agregar fotos de incidencia a reportes en estado Abierto.');
        }
      } else {
        if (estadoReporte !== 'EN_PROCESO' && estadoReporte !== 'RESUELTO') {
          throw new ForbiddenException('Solo se pueden agregar fotos de resolucion a reportes En proceso o Resueltos.');
        }
      }

      const createdRows = await manager.query(
        `
        INSERT INTO fotos_mantenimiento (nombre_archivo, url_archivo, fecha_carga, tipo, id_reporte)
        VALUES ($1, $2, NOW(), $3, $4)
        RETURNING id_foto, id_reporte, nombre_archivo, url_archivo, fecha_carga, tipo
        `,
        [(input.nombreArchivo || archivo.originalname).trim(), urlArchivo, input.tipo, input.idReporte],
      );

      if (createdRows.length === 0) {
        throw new BadRequestException('No fue posible crear la foto de mantenimiento.');
      }

      const row = createdRows[0] as Record<string, unknown>;
      const foto = {
        idFoto: Number(row.id_foto),
        idReporte: Number(row.id_reporte),
        idCondominio: input.idCondominio,
        nombreArchivo: String(row.nombre_archivo),
        urlArchivo: String(row.url_archivo),
        fechaCarga: new Date(String(row.fecha_carga)).toISOString(),
        tipo: String(row.tipo) as 'REPORTE' | 'RESOLUCION',
      };

      this.reportesMantenimientoGateway.emitMantenimientoChanged(input.idCondominio, {
        tipo: 'FOTO_CREADA',
        foto,
      });

      return foto;
    });
  }

  async delete(idFoto: number, idCondominio: number): Promise<{ ok: boolean }> {
    const rows = await this.dataSource.query(
      `
      SELECT f.id_foto, f.tipo, f.url_archivo, r.id_condominio, r.estado
      FROM fotos_mantenimiento f
      INNER JOIN reportes_mantenimiento r ON r.id_reporte = f.id_reporte
      WHERE f.id_foto = $1 AND r.id_condominio = $2
      LIMIT 1
      `,
      [idFoto, idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Foto de mantenimiento no encontrada en este condominio.');
    }

    const row = rows[0] as Record<string, unknown>;
    const tipo = String(row.tipo);
    const estado = String(row.estado);
    const urlArchivo = String(row.url_archivo);

    if (tipo === 'REPORTE' && estado !== 'ABIERTO') {
      throw new ForbiddenException('Solo se pueden eliminar fotos de incidencia de reportes en estado Abierto.');
    }

    if (tipo === 'RESOLUCION' && estado === 'CERRADO') {
      throw new ForbiddenException('No se pueden eliminar fotos de un reporte Cerrado.');
    }

    await this.dataSource.query(
      `DELETE FROM fotos_mantenimiento WHERE id_foto = $1`,
      [idFoto],
    );

    try {
      const urlParts = urlArchivo.split('/');
      const fileName = urlParts.pop();
      const subDir = urlParts.pop();
      if (fileName && subDir) {
        const filePath = join(process.cwd(), 'uploads', subDir, fileName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      // File deletion is best-effort
    }

    this.reportesMantenimientoGateway.emitMantenimientoChanged(idCondominio, {
      tipo: 'FOTO_ELIMINADA',
      idFoto,
    });

    return { ok: true };
  }

  private toRecord(row: Record<string, unknown>): FotoMantenimientoRecord {
    return {
      idFoto: Number(row.id_foto),
      idReporte: Number(row.id_reporte),
      idCondominio: Number(row.id_condominio),
      nombreArchivo: String(row.nombre_archivo),
      urlArchivo: String(row.url_archivo),
      fechaCarga: new Date(String(row.fecha_carga)).toISOString(),
      tipo: String(row.tipo) as 'REPORTE' | 'RESOLUCION',
    };
  }
}
