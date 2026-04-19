import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import { UpsertConfigNotificacionDto } from './dto/upsert-config-notificacion.dto';

type ConfigNotificacionRecord = {
  idConfig: number;
  idUsuarioCondominio: number;
  idCondominio: number;
  diasAntes: number;
  diasDespues: number;
  usarEmail: boolean;
  usarInterna: boolean;
  activo: boolean;
};

@Injectable()
export class ConfigNotificacionesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  async getByUsuario(idCondominio: number, idUsuarioCondominio: number): Promise<ConfigNotificacionRecord> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_config,
        c.id_usuario_condominio,
        uc.id_condominio,
        c.dias_antes,
        c.dias_despues,
        c.usar_email,
        c.usar_interna,
        c.activo
      FROM config_notificaciones c
      INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = c.id_usuario_condominio
      WHERE c.id_usuario_condominio = $1 AND uc.id_condominio = $2
      LIMIT 1
      `,
      [idUsuarioCondominio, idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro configuracion de notificaciones para el usuario-condominio.');
    }

    return this.toRecord(rows[0] as Record<string, unknown>);
  }

  async upsert(input: UpsertConfigNotificacionDto): Promise<ConfigNotificacionRecord> {
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

      const rows = await manager.query(
        `
        INSERT INTO config_notificaciones (
          dias_antes,
          dias_despues,
          usar_email,
          usar_interna,
          activo,
          id_usuario_condominio
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id_usuario_condominio)
        DO UPDATE SET
          dias_antes = EXCLUDED.dias_antes,
          dias_despues = EXCLUDED.dias_despues,
          usar_email = EXCLUDED.usar_email,
          usar_interna = EXCLUDED.usar_interna,
          activo = EXCLUDED.activo
        RETURNING id_config, id_usuario_condominio, dias_antes, dias_despues, usar_email, usar_interna, activo
        `,
        [
          input.diasAntes,
          input.diasDespues,
          input.usarEmail,
          input.usarInterna,
          input.activo,
          input.idUsuarioCondominio,
        ],
      );

      if (rows.length === 0) {
        throw new BadRequestException('No fue posible guardar la configuracion de notificaciones.');
      }

      const row = rows[0] as Record<string, unknown>;
      const config = {
        idConfig: Number(row.id_config),
        idUsuarioCondominio: Number(row.id_usuario_condominio),
        idCondominio: input.idCondominio,
        diasAntes: Number(row.dias_antes),
        diasDespues: Number(row.dias_despues),
        usarEmail: Boolean(row.usar_email),
        usarInterna: Boolean(row.usar_interna),
        activo: Boolean(row.activo),
      };

      this.notificacionesGateway.emitConfigChanged(config.idCondominio, config.idUsuarioCondominio, {
        tipo: 'CONFIG_ACTUALIZADA',
        config,
      });

      return config;
    });
  }

  private toRecord(row: Record<string, unknown>): ConfigNotificacionRecord {
    return {
      idConfig: Number(row.id_config),
      idUsuarioCondominio: Number(row.id_usuario_condominio),
      idCondominio: Number(row.id_condominio),
      diasAntes: Number(row.dias_antes),
      diasDespues: Number(row.dias_despues),
      usarEmail: Boolean(row.usar_email),
      usarInterna: Boolean(row.usar_interna),
      activo: Boolean(row.activo),
    };
  }
}
