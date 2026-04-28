import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type CuotaEstado = 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';

type CuotaRecord = {
  idCuota: number;
  idCondominio: number;
  periodo: string;
  tipo: string;
  monto: number;
  fechaLimite: string;
  recargo: number;
  estado: CuotaEstado;
};

@Injectable()
export class CuotasService {
  constructor(private readonly dataSource: DataSource) {}

  async listByCondominio(idCondominio: number): Promise<CuotaRecord[]> {
    await this.ensureCurrentPeriodCuotas(idCondominio);

    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_cuota,
        c.id_condominio,
        c.periodo,
        c.tipo,
        c.monto_base,
        c.fecha_limite,
        c.recargo_por_dia,
        c.estado AS cuota_estado,
        p.estado AS pago_estado
      FROM cuotas c
      LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
      WHERE c.id_condominio = $1
      ORDER BY c.fecha_limite DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => this.toCuotaRecord(row));
  }

  async findByCondominioAndId(idCondominio: number, idCuota: number): Promise<CuotaRecord> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_cuota,
        c.id_condominio,
        c.periodo,
        c.tipo,
        c.monto_base,
        c.fecha_limite,
        c.recargo_por_dia,
        c.estado AS cuota_estado,
        p.estado AS pago_estado
      FROM cuotas c
      LEFT JOIN pagos p ON p.id_cuota = c.id_cuota
      WHERE c.id_condominio = $1 AND c.id_cuota = $2
      LIMIT 1
      `,
      [idCondominio, idCuota],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la cuota para el condominio indicado.');
    }

    return this.toCuotaRecord(rows[0] as Record<string, unknown>);
  }

  async markEnValidacion(idCondominio: number, idCuota: number): Promise<void> {
    await this.findByCondominioAndId(idCondominio, idCuota);
  }

  async markPagada(idCondominio: number, idCuota: number): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuotas
      SET estado = 'PAGADA', recargo_por_dia = 0
      WHERE id_condominio = $1 AND id_cuota = $2
      `,
      [idCondominio, idCuota],
    );
  }

  async markPendiente(idCondominio: number, idCuota: number): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE cuotas
      SET estado = 'PENDIENTE'
      WHERE id_condominio = $1 AND id_cuota = $2 AND estado <> 'PAGADA'
      `,
      [idCondominio, idCuota],
    );
  }

  private async ensureCurrentPeriodCuotas(idCondominio: number) {
    const periodoActual = this.currentPeriodKey();

    const templateRows = await this.dataSource.query(
      `
      SELECT monto_base, recargo_por_dia, fecha_limite, tipo
      FROM cuotas
      WHERE id_condominio = $1
      ORDER BY periodo DESC, id_cuota DESC
      LIMIT 1
      `,
      [idCondominio],
    );

    if (templateRows.length === 0) {
      return;
    }

    const template = templateRows[0] as Record<string, unknown>;
    const montoBase = Number(template.monto_base ?? 0);
    const recargoPorDia = Number(template.recargo_por_dia ?? 0);
    const tipo = String(template.tipo ?? 'Cuota de mantenimiento');
    const fechaTemplate = String(template.fecha_limite ?? `${new Date().toISOString().slice(0, 10)}`);
    const diaLimite = Number(fechaTemplate.split('-')[2] ?? '10');
    const fechaLimite = this.periodDeadline(periodoActual, diaLimite);

    const unidadesRows = await this.dataSource.query(
      `
      SELECT id_unidad
      FROM unidades
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      `,
      [idCondominio],
    );

    for (const unidad of unidadesRows as Array<Record<string, unknown>>) {
      const idUnidad = Number(unidad.id_unidad);
      await this.dataSource.query(
        `
        INSERT INTO cuotas (
          periodo,
          tipo,
          monto_base,
          fecha_limite,
          recargo_por_dia,
          estado,
          id_condominio,
          id_unidad
        )
        VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6, $7)
        ON CONFLICT (id_unidad, periodo) DO NOTHING
        `,
        [periodoActual, tipo, montoBase, fechaLimite, recargoPorDia, idCondominio, idUnidad],
      );
    }
  }

  private currentPeriodKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private periodDeadline(periodo: string, diaLimite: number): string {
    const [yearRaw, monthRaw] = periodo.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const clampedDay = Math.max(1, Math.min(28, diaLimite));
    return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
  }

  private toCuotaRecord(row: Record<string, unknown>): CuotaRecord {
    return {
      idCuota: Number(row.id_cuota),
      idCondominio: Number(row.id_condominio),
      periodo: String(row.periodo),
      tipo: String(row.tipo ?? 'Cuota de mantenimiento'),
      monto: Number(row.monto_base),
      fechaLimite: String(row.fecha_limite),
      recargo: Number(row.recargo_por_dia),
      estado: this.resolveEstado(String(row.cuota_estado), row.pago_estado ? String(row.pago_estado) : null),
    };
  }

  private resolveEstado(cuotaEstado: string, pagoEstado: string | null): CuotaEstado {
    if (cuotaEstado === 'PAGADA') {
      return 'PAGADA';
    }

    if (pagoEstado === 'CAPTURADO') {
      return 'EN_VALIDACION';
    }

    return 'PENDIENTE';
  }
}