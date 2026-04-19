import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateNotificacionDto, MarcarNotificacionLeidaDto } from './dto/create-notificacion.dto';
import { NotificacionesGateway } from './notificaciones.gateway';

type NotificacionRecord = {
  idNotificacion: number;
  idCondominio: number;
  idUsuarioCondominio: number;
  tipo: string;
  canal: string;
  asunto: string;
  mensaje: string;
  fechaProgramada: string;
  fechaEnvio: string | null;
  estado: string;
  idConfig: number | null;
};

@Injectable()
export class NotificacionesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  async listByCondominio(
    idCondominio: number,
    idUsuarioCondominio: number,
    estado?: string,
  ): Promise<NotificacionRecord[]> {
    const params: Array<number | string> = [idCondominio, idUsuarioCondominio];
    let estadoClause = '';

    if (estado) {
      params.push(estado);
      estadoClause = ` AND n.estado = $${params.length}`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        n.id_notificacion,
        uc.id_condominio,
        n.id_usuario_condominio,
        n.tipo,
        n.canal,
        n.asunto,
        n.mensaje,
        n.fecha_programada,
        n.fecha_envio,
        n.estado,
        n.id_config
      FROM notificaciones n
      INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = n.id_usuario_condominio
      WHERE uc.id_condominio = $1
        AND n.id_usuario_condominio = $2${estadoClause}
      ORDER BY n.fecha_programada DESC
      `,
      params,
    );

    return this.normalizeQueryRows(rows).map((row: Record<string, unknown>) => this.toRecord(row));
  }

  async create(input: CreateNotificacionDto): Promise<NotificacionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const ucRows = await manager.query(
        `
        SELECT id_usuario_condominio
        FROM usuarios_condominios
        WHERE id_usuario_condominio = $1 AND id_condominio = $2
        LIMIT 1
        `,
        [input.idUsuarioCondominio, input.idCondominio],
      );

      if (ucRows.length === 0) {
        throw new BadRequestException('El usuario-condominio no pertenece al condominio indicado.');
      }

      if (input.idConfig) {
        const configRows = await manager.query(
          `
          SELECT id_config
          FROM config_notificaciones
          WHERE id_config = $1 AND id_usuario_condominio = $2
          LIMIT 1
          `,
          [input.idConfig, input.idUsuarioCondominio],
        );

        if (configRows.length === 0) {
          throw new BadRequestException('La configuracion indicada no pertenece al usuario-condominio.');
        }
      }

      const fechaProgramada = new Date(input.fechaProgramada);
      if (Number.isNaN(fechaProgramada.getTime())) {
        throw new BadRequestException('La fechaProgramada no es valida.');
      }

      const rows = await manager.query(
        `
        INSERT INTO notificaciones (
          tipo,
          canal,
          asunto,
          mensaje,
          fecha_programada,
          fecha_envio,
          estado,
          id_usuario_condominio,
          id_config
        )
        VALUES ($1, $2, $3, $4, $5, NULL, 'PROGRAMADA', $6, $7)
        RETURNING
          id_notificacion,
          tipo,
          canal,
          asunto,
          mensaje,
          fecha_programada,
          fecha_envio,
          estado,
          id_usuario_condominio,
          id_config
        `,
        [
          input.tipo,
          input.canal,
          input.asunto.trim(),
          input.mensaje.trim(),
          fechaProgramada.toISOString(),
          input.idUsuarioCondominio,
          input.idConfig ?? null,
        ],
      );

      const normalizedRows = this.normalizeQueryRows(rows);
      if (normalizedRows.length === 0) {
        throw new BadRequestException('No fue posible crear la notificacion.');
      }

      const row = normalizedRows[0] as Record<string, unknown>;
      const created = {
        idNotificacion: Number(row.id_notificacion),
        idCondominio: input.idCondominio,
        idUsuarioCondominio: Number(row.id_usuario_condominio),
        tipo: String(row.tipo),
        canal: String(row.canal),
        asunto: String(row.asunto),
        mensaje: String(row.mensaje),
        fechaProgramada: this.toIsoDate(row.fecha_programada),
        fechaEnvio: row.fecha_envio ? this.toIsoDate(row.fecha_envio) : null,
        estado: String(row.estado),
        idConfig: row.id_config ? Number(row.id_config) : null,
      };

      this.notificacionesGateway.emitNotificacionChanged(
        created.idCondominio,
        created.idUsuarioCondominio,
        {
          tipo: 'CREADA',
          notificacion: created,
        },
      );

      return created;
    });
  }

  async marcarLeida(input: MarcarNotificacionLeidaDto): Promise<NotificacionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        UPDATE notificaciones n
        SET estado = 'LEIDA',
            fecha_envio = COALESCE(n.fecha_envio, NOW())
        WHERE n.id_notificacion = $1
          AND EXISTS (
            SELECT 1
            FROM usuarios_condominios uc
            WHERE uc.id_usuario_condominio = n.id_usuario_condominio
              AND uc.id_condominio = $2
          )
        RETURNING
          n.id_notificacion,
          n.tipo,
          n.canal,
          n.asunto,
          n.mensaje,
          n.fecha_programada,
          n.fecha_envio,
          n.estado,
          n.id_usuario_condominio,
          n.id_config
        `,
        [input.idNotificacion, input.idCondominio],
      );

      const normalizedRows = this.normalizeQueryRows(rows);
      if (normalizedRows.length === 0) {
        throw new NotFoundException('No se encontro la notificacion para el condominio indicado.');
      }

      const row = normalizedRows[0] as Record<string, unknown>;
      const updated = {
        idNotificacion: Number(row.id_notificacion),
        idCondominio: input.idCondominio,
        idUsuarioCondominio: Number(row.id_usuario_condominio),
        tipo: String(row.tipo),
        canal: String(row.canal),
        asunto: String(row.asunto),
        mensaje: String(row.mensaje),
        fechaProgramada: this.toIsoDate(row.fecha_programada),
        fechaEnvio: row.fecha_envio ? this.toIsoDate(row.fecha_envio) : null,
        estado: String(row.estado),
        idConfig: row.id_config ? Number(row.id_config) : null,
      };

      this.notificacionesGateway.emitNotificacionChanged(
        updated.idCondominio,
        updated.idUsuarioCondominio,
        {
          tipo: 'LEIDA',
          notificacion: updated,
        },
      );

      return updated;
    });
  }

  private toRecord(row: Record<string, unknown>): NotificacionRecord {
    return {
      idNotificacion: Number(row.id_notificacion),
      idCondominio: Number(row.id_condominio),
      idUsuarioCondominio: Number(row.id_usuario_condominio),
      tipo: String(row.tipo),
      canal: String(row.canal),
      asunto: String(row.asunto),
      mensaje: String(row.mensaje),
      fechaProgramada: this.toIsoDate(row.fecha_programada),
      fechaEnvio: row.fecha_envio ? this.toIsoDate(row.fecha_envio) : null,
      estado: String(row.estado),
      idConfig: row.id_config ? Number(row.id_config) : null,
    };
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
}
