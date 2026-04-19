import { Injectable } from '@nestjs/common';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { DataSource } from 'typeorm';

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
  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(idCondominio: number): Promise<GastoRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT id_gasto, id_condominio, concepto, categoria, monto, fecha
      FROM gastos
      WHERE id_condominio = $1
      ORDER BY fecha DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => this.toGastoRecord(row));
  }

  async create(input: CreateGastoDto): Promise<GastoRecord> {
    const rows = await this.dataSource.query(
      `
      INSERT INTO gastos (
        concepto,
        categoria,
        monto,
        fecha,
        proveedor,
        nota,
        url_comprobante,
        id_condominio
      )
      VALUES ($1, $2, $3, NOW(), NULL, NULL, NULL, $4)
      RETURNING id_gasto, id_condominio, concepto, categoria, monto, fecha
      `,
      [input.concepto.trim(), input.categoria.trim(), input.monto, input.idCondominio],
    );

    return this.toGastoRecord(rows[0] as Record<string, unknown>);
  }

  private toGastoRecord(row: Record<string, unknown>): GastoRecord {
    return {
      idGasto: Number(row.id_gasto),
      idCondominio: Number(row.id_condominio),
      concepto: String(row.concepto),
      categoria: String(row.categoria),
      monto: Number(row.monto),
      fecha: new Date(String(row.fecha)).toISOString(),
    };
  }
}