import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GenerarReciboDto } from './dto/generar-recibo.dto';

type ReciboRecord = {
  idRecibo: number;
  idPago: number;
  idCondominio: number;
  folio: string;
  fechaGeneracion: string;
  urlPdf: string;
};

@Injectable()
export class RecibosService {
  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(idCondominio: number, idPago?: number): Promise<ReciboRecord[]> {
    const params: Array<number> = [idCondominio];
    let pagoClause = '';

    if (idPago) {
      params.push(idPago);
      pagoClause = ` AND r.id_pago = $${params.length}`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        r.id_recibo,
        r.id_pago,
        c.id_condominio,
        r.folio,
        r.fecha_generacion,
        r.url_pdf
      FROM recibos r
      INNER JOIN pagos p ON p.id_pago = r.id_pago
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      WHERE c.id_condominio = $1${pagoClause}
      ORDER BY r.fecha_generacion DESC
      `,
      params,
    );

    return rows.map((row: Record<string, unknown>) => this.toRecord(row));
  }

  async generar(input: GenerarReciboDto): Promise<ReciboRecord> {
    return this.dataSource.transaction(async (manager) => {
      const pagoRows = await manager.query(
        `
        SELECT p.id_pago, p.estado
        FROM pagos p
        INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
        WHERE p.id_pago = $1 AND c.id_condominio = $2
        FOR UPDATE
        `,
        [input.idPago, input.idCondominio],
      );

      if (pagoRows.length === 0) {
        throw new NotFoundException('No se encontro el pago para el condominio indicado.');
      }

      const pago = pagoRows[0] as Record<string, unknown>;
      if (String(pago.estado) !== 'VALIDADO') {
        throw new BadRequestException('Solo se puede generar recibo para pagos en estado VALIDADO.');
      }

      const existingRows = await manager.query(
        `
        SELECT id_recibo, id_pago, folio, fecha_generacion, url_pdf
        FROM recibos
        WHERE id_pago = $1
        LIMIT 1
        `,
        [input.idPago],
      );

      if (existingRows.length > 0) {
        const existing = existingRows[0] as Record<string, unknown>;
        return {
          idRecibo: Number(existing.id_recibo),
          idPago: Number(existing.id_pago),
          idCondominio: input.idCondominio,
          folio: String(existing.folio),
          fechaGeneracion: new Date(String(existing.fecha_generacion)).toISOString(),
          urlPdf: String(existing.url_pdf),
        };
      }

      const now = new Date();
      const stamp = now
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14);
      const folio = `ELYX-${input.idCondominio}-${input.idPago}-${stamp}`;
      const urlPdf = input.urlPdf?.trim() ?? `https://files.elyx.local/recibos/${folio}.pdf`;

      const createdRows = await manager.query(
        `
        INSERT INTO recibos (folio, fecha_generacion, url_pdf, id_pago)
        VALUES ($1, NOW(), $2, $3)
        RETURNING id_recibo, id_pago, folio, fecha_generacion, url_pdf
        `,
        [folio, urlPdf, input.idPago],
      );

      if (createdRows.length === 0) {
        throw new BadRequestException('No fue posible generar el recibo.');
      }

      const created = createdRows[0] as Record<string, unknown>;
      return {
        idRecibo: Number(created.id_recibo),
        idPago: Number(created.id_pago),
        idCondominio: input.idCondominio,
        folio: String(created.folio),
        fechaGeneracion: new Date(String(created.fecha_generacion)).toISOString(),
        urlPdf: String(created.url_pdf),
      };
    });
  }

  private toRecord(row: Record<string, unknown>): ReciboRecord {
    return {
      idRecibo: Number(row.id_recibo),
      idPago: Number(row.id_pago),
      idCondominio: Number(row.id_condominio),
      folio: String(row.folio),
      fechaGeneracion: new Date(String(row.fecha_generacion)).toISOString(),
      urlPdf: String(row.url_pdf),
    };
  }
}
