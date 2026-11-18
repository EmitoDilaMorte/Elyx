import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { filasDe } from '../../common/db/resultado-query';
import { NotificacionesGateway } from './notificaciones.gateway';

type Insertada = {
  id_notificacion: number;
  id_usuario_condominio: number;
  id_condominio: number;
  usar_email: boolean;
  usar_push: boolean;
  usar_interna: boolean;
};

/**
 * Recordatorios de cuotas.
 *
 * Usa `config_notificaciones.dias_antes` y `dias_despues`, que hasta ahora se
 * guardaban pero ningun proceso leia.
 *
 * Corre una vez al dia a las 8:00, fuera de la ventana de los crons de
 * suscripciones (2 a 5 AM) para no competir por conexiones.
 *
 * La deduplicacion va en SQL: `clave_dedupe` es unica, asi que correr el cron
 * dos veces el mismo dia (o en dos instancias) no genera avisos repetidos.
 * La degradacion por cuota de correo la aplica el despachador.
 */
@Injectable()
export class RecordatoriosCuotasService {
  private readonly logger = new Logger(RecordatoriosCuotasService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  @Cron('0 0 8 * * *')
  async ejecutar(): Promise<void> {
    if ((process.env.RECORDATORIOS_ENABLED ?? 'true').trim().toLowerCase() === 'false') {
      return;
    }

    try {
      const antes = await this.recordarAntes();
      const despues = await this.recordarDespues();

      if (antes + despues > 0) {
        this.logger.log(`Recordatorios de cuota generados: ${antes} antes, ${despues} despues.`);
      }
    } catch (error) {
      this.logger.error(`No fue posible generar los recordatorios: ${(error as Error).message}`);
    }
  }

  private async recordarAntes(): Promise<number> {
    const insertadas = await this.insertar(
      'RECORDATORIO_ANTES_VENCIMIENTO',
      `
      cu.estado = 'PENDIENTE'
        AND cfg.dias_antes > 0
        AND cu.fecha_limite = CURRENT_DATE + cfg.dias_antes
      `,
      'RECORDATORIO_ANTES',
      (fila) =>
        `Tu cuota del periodo ${fila.periodo} por $${fila.monto} vence el ${fila.fecha_limite}. ` +
        'Puedes pagarla desde la seccion Pagos.',
    );

    await this.emitir(insertadas);
    return insertadas.length;
  }

  private async recordarDespues(): Promise<number> {
    const insertadas = await this.insertar(
      'RECORDATORIO_DESPUES_VENCIMIENTO',
      `
      cu.estado IN ('PENDIENTE', 'VENCIDA')
        AND cfg.dias_despues > 0
        AND cu.fecha_limite = CURRENT_DATE - cfg.dias_despues
      `,
      'RECORDATORIO_DESPUES',
      (fila) =>
        `Tu cuota del periodo ${fila.periodo} por $${fila.monto} vencio el ${fila.fecha_limite}. ` +
        'Regularizala desde la seccion Pagos para evitar recargos.',
    );

    await this.emitir(insertadas);
    return insertadas.length;
  }

  /**
   * Inserta las notificaciones de un tipo.
   *
   * Solo considera ocupantes vigentes y configuraciones activas. `clave_dedupe`
   * incluye la cuota y el usuario, asi que una misma cuota no genera dos
   * recordatorios para la misma persona.
   */
  private async insertar(
    tipo: string,
    condicionCuota: string,
    prefijoClave: string,
    construirMensaje: (fila: Record<string, string>) => string,
  ): Promise<Insertada[]> {
    const filas = await this.dataSource.query(
      `
      SELECT
        cu.id_cuota,
        cu.periodo,
        cu.fecha_limite::text AS fecha_limite,
        to_char(cu.monto_base, 'FM999999990.00') AS monto,
        uc.id_usuario_condominio,
        uc.id_condominio,
        cfg.id_config,
        cfg.usar_email,
        cfg.usar_interna,
        cfg.usar_push
      FROM cuotas cu
      INNER JOIN unidades u ON u.id_unidad = cu.id_unidad
      INNER JOIN unidades_ocupantes uo
        ON uo.id_unidad = u.id_unidad
       AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
      INNER JOIN usuarios_condominios uc
        ON uc.id_usuario_condominio = uo.id_usuario_condominio
       AND uc.estado = 'ACTIVO'
      INNER JOIN config_notificaciones cfg
        ON cfg.id_usuario_condominio = uc.id_usuario_condominio
      WHERE ${condicionCuota}
        AND cfg.activo = TRUE
        AND (cfg.usar_interna = TRUE OR cfg.usar_email = TRUE OR cfg.usar_push = TRUE)
      `,
    );

    const candidatas = Array.isArray(filas) ? (filas as Array<Record<string, unknown>>) : [];
    const creadas: Insertada[] = [];

    for (const fila of candidatas) {
      const idCuota = Number(fila.id_cuota);
      const idUsuarioCondominio = Number(fila.id_usuario_condominio);
      const usarInterna = Boolean(fila.usar_interna);
      const usarEmail = Boolean(fila.usar_email);
      const usarPush = Boolean(fila.usar_push);

      const mensaje = construirMensaje({
        periodo: String(fila.periodo),
        monto: String(fila.monto),
        fecha_limite: String(fila.fecha_limite),
      });

      const clave = `${prefijoClave}:${idCuota}:${idUsuarioCondominio}`;

      const rows = await this.dataSource.query(
        `
        INSERT INTO notificaciones (
          tipo, canal, asunto, mensaje, fecha_programada, fecha_envio, estado,
          leida_en, visible_en_bandeja, clave_dedupe, id_usuario_condominio, id_config
        )
        VALUES ($1, $2, $3, $4, NOW(), NOW(), 'ENVIADA', NULL, $5, $6, $7, $8)
        ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL DO NOTHING
        RETURNING id_notificacion
        `,
        [
          tipo,
          usarInterna ? 'INTERNA' : 'EMAIL',
          tipo === 'RECORDATORIO_ANTES_VENCIMIENTO'
            ? 'Tu cuota esta por vencer'
            : 'Tu cuota esta vencida',
          mensaje,
          usarInterna,
          clave,
          idUsuarioCondominio,
          fila.id_config ? Number(fila.id_config) : null,
        ],
      );

      const normalizadas = filasDe(rows);
      if (normalizadas.length === 0) {
        continue;
      }

      const idNotificacion = Number(normalizadas[0].id_notificacion);
      const canales: string[] = [];
      if (usarEmail) {
        canales.push('EMAIL');
      }
      if (usarPush) {
        canales.push('PUSH');
      }

      if (canales.length > 0) {
        await this.dataSource.query(
          `
          INSERT INTO notificacion_entregas (id_notificacion, canal, estado, proximo_intento_en)
          SELECT $1, c.canal, 'PENDIENTE', NOW()
          FROM unnest($2::text[]) AS c(canal)
          ON CONFLICT (id_notificacion, canal) DO NOTHING
          `,
          [idNotificacion, canales],
        );
      }

      creadas.push({
        id_notificacion: idNotificacion,
        id_usuario_condominio: idUsuarioCondominio,
        id_condominio: Number(fila.id_condominio),
        usar_email: usarEmail,
        usar_push: usarPush,
        usar_interna: usarInterna,
      });
    }

    return creadas;
  }

  private async emitir(insertadas: Insertada[]): Promise<void> {
    for (const fila of insertadas) {
      if (!fila.usar_interna) {
        continue;
      }
      this.notificacionesGateway.emitNotificacionChanged(
        fila.id_condominio,
        fila.id_usuario_condominio,
        { tipo: 'RECORDATORIO' },
      );
    }
  }
}
