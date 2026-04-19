import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateEvidenciaPagoDto } from './dto/create-evidencia-pago.dto';
import { EvidenciasPagoGateway } from './evidencias-pago.gateway';

type EvidenciaPagoRecord = {
  idEvidencia: number;
  idPago: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
};

@Injectable()
export class EvidenciasPagoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly evidenciasPagoGateway: EvidenciasPagoGateway,
  ) {}

  private getPublicFilesBaseUrl(): string {
    const configured = process.env.PUBLIC_FILES_BASE_URL?.trim();
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    return 'http://localhost:3000';
  }

  async listByCondominio(idCondominio: number, idPago?: number): Promise<EvidenciaPagoRecord[]> {
    const params: Array<number> = [idCondominio];
    let pagoClause = '';

    if (idPago) {
      params.push(idPago);
      pagoClause = ` AND p.id_pago = $${params.length}`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        e.id_evidencia,
        e.id_pago,
        c.id_condominio,
        e.nombre_archivo,
        e.url_archivo,
        e.fecha_carga
      FROM evidencias_pago e
      INNER JOIN pagos p ON p.id_pago = e.id_pago
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      WHERE c.id_condominio = $1${pagoClause}
      ORDER BY e.fecha_carga DESC
      `,
      params,
    );

    return rows.map((row: Record<string, unknown>) => this.toRecord(row));
  }

  async create(input: CreateEvidenciaPagoDto, archivo: Express.Multer.File): Promise<EvidenciaPagoRecord> {
    return this.dataSource.transaction(async (manager) => {
      const safeFilename = archivo.filename;
      if (!safeFilename) {
        throw new BadRequestException('No fue posible guardar el archivo de comprobante.');
      }

      const baseUrl = this.getPublicFilesBaseUrl();
      const urlArchivo = `${baseUrl}/uploads/evidencias/${safeFilename}`;

      const pagoRows = await manager.query(
        `
        SELECT p.id_pago
        FROM pagos p
        INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
        WHERE p.id_pago = $1 AND c.id_condominio = $2
        LIMIT 1
        `,
        [input.idPago, input.idCondominio],
      );

      if (pagoRows.length === 0) {
        throw new NotFoundException('No se encontro el pago para el condominio indicado.');
      }

      const createdRows = await manager.query(
        `
        INSERT INTO evidencias_pago (nombre_archivo, url_archivo, fecha_carga, id_pago)
        VALUES ($1, $2, NOW(), $3)
        RETURNING id_evidencia, id_pago, nombre_archivo, url_archivo, fecha_carga
        `,
        [(input.nombreArchivo || archivo.originalname).trim(), urlArchivo, input.idPago],
      );

      if (createdRows.length === 0) {
        throw new BadRequestException('No fue posible crear la evidencia de pago.');
      }

      const row = createdRows[0] as Record<string, unknown>;
      const evidencia = {
        idEvidencia: Number(row.id_evidencia),
        idPago: Number(row.id_pago),
        idCondominio: input.idCondominio,
        nombreArchivo: String(row.nombre_archivo),
        urlArchivo: String(row.url_archivo),
        fechaCarga: new Date(String(row.fecha_carga)).toISOString(),
      };

      this.evidenciasPagoGateway.emitEvidenciaChanged(input.idCondominio, {
        tipo: 'CREADA',
        evidencia,
      });

      return evidencia;
    });
  }

  private toRecord(row: Record<string, unknown>): EvidenciaPagoRecord {
    return {
      idEvidencia: Number(row.id_evidencia),
      idPago: Number(row.id_pago),
      idCondominio: Number(row.id_condominio),
      nombreArchivo: String(row.nombre_archivo),
      urlArchivo: String(row.url_archivo),
      fechaCarga: new Date(String(row.fecha_carga)).toISOString(),
    };
  }
}
