import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PagoEstado } from '../../common/enums/pago-estado.enum';
import { AprobarPagoDto, RechazarPagoDto } from './dto/actualizar-pago.dto';
import { CapturarPagoDto } from './dto/capturar-pago.dto';
import { DataSource } from 'typeorm';
import { PagosGateway } from './pagos.gateway';

const ERR_PAGO_NO_ENCONTRADO = 'No se encontro el pago para el condominio indicado.';
const ERR_CUOTA_NO_ENCONTRADA = 'No se encontro la cuota para el condominio indicado.';
const ERR_PAGO_NO_CAPTURADO = 'Solo se pueden procesar pagos en estado CAPTURADO.';

type PagoRecord = {
  idPago: number;
  idCondominio: number;
  idCuota: number;
  monto: number;
  fechaPago: string;
  estado: PagoEstado;
  idUsuarioCondominioPaga: number;
  idUsuarioCondominioAdmin: number | null;
  motivoRechazo: string | null;
};

@Injectable()
export class PagosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pagosGateway: PagosGateway,
  ) {}

  async listByCondominio(idCondominio: number, estado?: PagoEstado): Promise<PagoRecord[]> {
    const params: Array<number | string> = [idCondominio];
    let estadoClause = '';

    if (estado) {
      params.push(estado);
      estadoClause = ` AND p.estado = $${params.length}`;
    }

    const rawRows = await this.dataSource.query(
      `
      SELECT
        p.id_pago,
        c.id_condominio,
        p.id_cuota,
        p.monto,
        p.fecha_pago,
        p.estado,
        p.id_usuario_condominio_paga,
        p.id_usuario_condominio_admin,
        p.motivo_rechazo
      FROM pagos p
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      WHERE c.id_condominio = $1${estadoClause}
      ORDER BY p.fecha_pago DESC
      `,
      params,
    );

    const rows = this.normalizeQueryRows(rawRows);
    return rows.map((row: Record<string, unknown>) => this.toPagoRecord(row));
  }

  async capturar(input: CapturarPagoDto): Promise<PagoRecord> {
    await this.dataSource.transaction(async (manager) => {
      const cuotaRaw = await manager.query(
        `
        SELECT c.id_cuota, c.id_condominio, c.monto_base, c.estado
        FROM cuotas c
        WHERE c.id_condominio = $1 AND c.id_cuota = $2
        LIMIT 1
        FOR UPDATE
        `,
        [input.idCondominio, input.idCuota],
      );

      const cuotaRows = this.normalizeQueryRows(cuotaRaw);
      if (cuotaRows.length === 0) {
        throw new NotFoundException(ERR_CUOTA_NO_ENCONTRADA);
      }

      const cuota = cuotaRows[0] as Record<string, unknown>;
      if (String(cuota.estado) !== 'PENDIENTE') {
        throw new BadRequestException('Solo se pueden capturar pagos para cuotas pendientes.');
      }

      await this.ensureUsuarioCondominioEnCondominio(
        manager,
        input.idUsuarioCondominioPaga,
        input.idCondominio,
        'El usuario que paga no pertenece al condominio indicado.',
      );

      const pagoRaw = await manager.query(
        `
        SELECT id_pago, estado
        FROM pagos
        WHERE id_cuota = $1
        LIMIT 1
        FOR UPDATE
        `,
        [input.idCuota],
      );

      const pagoRows = this.normalizeQueryRows(pagoRaw);
      if (pagoRows.length > 0 && String(pagoRows[0].estado) !== PagoEstado.RECHAZADO) {
        throw new BadRequestException('La cuota ya tiene un pago capturado o validado.');
      }

      if (pagoRows.length > 0 && String(pagoRows[0].estado) === PagoEstado.RECHAZADO) {
        await manager.query('DELETE FROM pagos WHERE id_pago = $1', [Number(pagoRows[0].id_pago)]);
      }

      const createdRaw = await manager.query(
        `
        INSERT INTO pagos (
          monto,
          fecha_pago,
          estado,
          referencia,
          motivo_rechazo,
          id_cuota,
          id_usuario_condominio_paga,
          id_usuario_condominio_admin
        )
        VALUES ($1, NOW(), 'CAPTURADO', NULL, NULL, $2, $3, NULL)
        RETURNING id_pago, monto, fecha_pago, estado, id_cuota, id_usuario_condominio_paga, id_usuario_condominio_admin, motivo_rechazo
        `,
        [Number(cuota.monto_base), input.idCuota, input.idUsuarioCondominioPaga],
      );

      const createdRows = this.normalizeQueryRows(createdRaw);
      if (createdRows.length === 0) {
        throw new BadRequestException('No fue posible capturar el pago.');
      }
    });

    const pago = await this.getPagoRecordByCuota(input.idCuota, input.idCondominio);
    this.pagosGateway.emitPagoChanged(input.idCondominio, {
      tipo: 'CAPTURADO',
      pago,
    });
    return pago;
  }

  async aprobar(input: AprobarPagoDto): Promise<PagoRecord> {
    const pago = await this.dataSource.transaction(async (manager) => {
      const rowsRaw = await manager.query(
        `
        SELECT
          p.id_pago,
          p.id_cuota,
          p.monto,
          p.fecha_pago,
          p.estado,
          p.id_usuario_condominio_paga,
          p.id_usuario_condominio_admin,
          p.motivo_rechazo,
          c.id_condominio
        FROM pagos p
        INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
        WHERE p.id_pago = $1 AND c.id_condominio = $2
        LIMIT 1
        FOR UPDATE
        `,
        [input.idPago, input.idCondominio],
      );

      const rows = this.normalizeQueryRows(rowsRaw);
      if (rows.length === 0) {
        throw new NotFoundException(ERR_PAGO_NO_ENCONTRADO);
      }

      const pago = rows[0] as Record<string, unknown>;
      if (String(pago.estado) !== PagoEstado.CAPTURADO) {
        throw new BadRequestException(ERR_PAGO_NO_CAPTURADO);
      }

      await this.ensureUsuarioCondominioEnCondominio(
        manager,
        input.idUsuarioCondominioAdmin,
        input.idCondominio,
        'El usuario administrador no pertenece al condominio indicado.',
      );

      const updatedRowsRaw = await manager.query(
        `
        UPDATE pagos
        SET estado = 'VALIDADO',
            id_usuario_condominio_admin = $1,
            motivo_rechazo = NULL
        WHERE id_pago = $2 AND estado = 'CAPTURADO'
        RETURNING id_pago, monto, fecha_pago, estado, id_cuota, id_usuario_condominio_paga, id_usuario_condominio_admin, motivo_rechazo
        `,
        [input.idUsuarioCondominioAdmin, input.idPago],
      );

      const updatedRows = this.normalizeQueryRows(updatedRowsRaw);
      if (updatedRows.length === 0) {
        throw new BadRequestException(ERR_PAGO_NO_CAPTURADO);
      }

      await manager.query(
        `
        UPDATE cuotas
        SET estado = 'PAGADA', recargo_por_dia = 0
        WHERE id_cuota = $1
        `,
        [Number(pago.id_cuota)],
      );

      return {
        idPago: input.idPago,
        idCondominio: input.idCondominio,
        idCuota: Number(pago.id_cuota),
        monto: Number(pago.monto),
        fechaPago: this.toIsoDate(pago.fecha_pago),
        estado: PagoEstado.VALIDADO,
        idUsuarioCondominioPaga: pago.id_usuario_condominio_paga ? Number(pago.id_usuario_condominio_paga) : 0,
        idUsuarioCondominioAdmin: input.idUsuarioCondominioAdmin,
        motivoRechazo: null,
      } satisfies PagoRecord;
    });

    this.pagosGateway.emitPagoChanged(input.idCondominio, {
      tipo: 'VALIDADO',
      pago,
    });

    return pago;
  }

  async rechazar(input: RechazarPagoDto): Promise<PagoRecord> {
    const pago = await this.dataSource.transaction(async (manager) => {
      const rowsRaw = await manager.query(
        `
        SELECT
          p.id_pago,
          p.id_cuota,
          p.monto,
          p.fecha_pago,
          p.estado,
          p.id_usuario_condominio_paga,
          p.id_usuario_condominio_admin,
          p.motivo_rechazo,
          c.id_condominio
        FROM pagos p
        INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
        WHERE p.id_pago = $1 AND c.id_condominio = $2
        LIMIT 1
        FOR UPDATE
        `,
        [input.idPago, input.idCondominio],
      );

      const rows = this.normalizeQueryRows(rowsRaw);
      if (rows.length === 0) {
        throw new NotFoundException(ERR_PAGO_NO_ENCONTRADO);
      }

      const pago = rows[0] as Record<string, unknown>;
      if (String(pago.estado) !== PagoEstado.CAPTURADO) {
        throw new BadRequestException(ERR_PAGO_NO_CAPTURADO);
      }

      await this.ensureUsuarioCondominioEnCondominio(
        manager,
        input.idUsuarioCondominioAdmin,
        input.idCondominio,
        'El usuario administrador no pertenece al condominio indicado.',
      );

      const updatedRowsRaw = await manager.query(
        `
        UPDATE pagos
        SET estado = 'RECHAZADO',
            id_usuario_condominio_admin = $1,
            motivo_rechazo = $2
        WHERE id_pago = $3 AND estado = 'CAPTURADO'
        RETURNING id_pago, monto, fecha_pago, estado, id_cuota, id_usuario_condominio_paga, id_usuario_condominio_admin, motivo_rechazo
        `,
        [input.idUsuarioCondominioAdmin, input.motivoRechazo.trim(), input.idPago],
      );

      const updatedRows = this.normalizeQueryRows(updatedRowsRaw);
      if (updatedRows.length === 0) {
        throw new BadRequestException(ERR_PAGO_NO_CAPTURADO);
      }

      await manager.query(
        `
        UPDATE cuotas
        SET estado = 'PENDIENTE'
        WHERE id_cuota = $1 AND estado <> 'PAGADA'
        `,
        [Number(pago.id_cuota)],
      );

      return {
        idPago: input.idPago,
        idCondominio: input.idCondominio,
        idCuota: Number(pago.id_cuota),
        monto: Number(pago.monto),
        fechaPago: this.toIsoDate(pago.fecha_pago),
        estado: PagoEstado.RECHAZADO,
        idUsuarioCondominioPaga: pago.id_usuario_condominio_paga ? Number(pago.id_usuario_condominio_paga) : 0,
        idUsuarioCondominioAdmin: input.idUsuarioCondominioAdmin,
        motivoRechazo: input.motivoRechazo.trim(),
      } satisfies PagoRecord;
    });

    this.pagosGateway.emitPagoChanged(input.idCondominio, {
      tipo: 'RECHAZADO',
      pago,
    });

    return pago;
  }

  private async getPagoRecordByCuota(idCuota: number, idCondominio: number): Promise<PagoRecord> {
    const rowsRaw = await this.dataSource.query(
      `
      SELECT
        p.id_pago,
        c.id_condominio,
        p.id_cuota,
        p.monto,
        p.fecha_pago,
        p.estado,
        p.id_usuario_condominio_paga,
        p.id_usuario_condominio_admin,
        p.motivo_rechazo
      FROM pagos p
      INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
      WHERE p.id_cuota = $1 AND c.id_condominio = $2
      LIMIT 1
      `,
      [idCuota, idCondominio],
    );

    const rows = this.normalizeQueryRows(rowsRaw);
    if (rows.length === 0) {
      throw new NotFoundException(ERR_PAGO_NO_ENCONTRADO);
    }

    return this.toPagoRecord(rows[0] as Record<string, unknown>);
  }

  private normalizeQueryRows(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) {
      return [];
    }

    if (raw.length > 0 && Array.isArray(raw[0])) {
      return (raw[0] as Array<Record<string, unknown>>) ?? [];
    }

    return raw as Array<Record<string, unknown>>;
  }

  private toPagoRecord(row: Record<string, unknown>): PagoRecord {
    const fechaPago = this.toIsoDate(row.fecha_pago);

    return {
      idPago: Number(row.id_pago),
      idCondominio: row.id_condominio ? Number(row.id_condominio) : 0,
      idCuota: row.id_cuota ? Number(row.id_cuota) : 0,
      monto: Number(row.monto),
      fechaPago,
      estado: String(row.estado) as PagoEstado,
      idUsuarioCondominioPaga: row.id_usuario_condominio_paga ? Number(row.id_usuario_condominio_paga) : 0,
      idUsuarioCondominioAdmin: row.id_usuario_condominio_admin ? Number(row.id_usuario_condominio_admin) : null,
      motivoRechazo: row.motivo_rechazo ? String(row.motivo_rechazo) : null,
    };
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

  private async ensureUsuarioCondominioEnCondominio(
    manager: { query: (query: string, parameters?: unknown[]) => Promise<unknown[]> },
    idUsuarioCondominio: number,
    idCondominio: number,
    message: string,
  ): Promise<void> {
    const rowsRaw = await manager.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_usuario_condominio = $1 AND id_condominio = $2
      LIMIT 1
      `,
      [idUsuarioCondominio, idCondominio],
    );

    const rows = this.normalizeQueryRows(rowsRaw);
    if (rows.length === 0) {
      throw new BadRequestException(message);
    }
  }
}