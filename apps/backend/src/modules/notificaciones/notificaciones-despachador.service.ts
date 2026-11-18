import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MailCupoService } from '../mail/mail.cupo.service';
import { MailService } from '../mail/mail.service';
import { plantillaNotificacion } from '../mail/mail.templates';
import { filasDe } from '../../common/db/resultado-query';
import { NotificacionesGateway } from './notificaciones.gateway';
import { PushService } from './push.service';

/** Entregas procesadas por corrida. Suficiente para vaciar la cola en minutos. */
const TAMANO_LOTE = 25;

/** Intentos antes de marcar la entrega como `FALLIDA`. */
const MAX_INTENTOS = 4;

/** Espera entre reintentos, en minutos. */
const BACKOFF_MINUTOS = [1, 5, 15, 60];

/**
 * Si una entrega queda `EN_PROCESO` mas de este tiempo, el proceso que la tomo
 * murio (reinicio, OOM) y otra instancia la libera. Evita entregas atoradas.
 */
const RECLAMO_MINUTOS = 10;

type EntregaPendiente = {
  id_entrega: number;
  id_notificacion: number;
  canal: 'EMAIL' | 'PUSH';
  intentos: number;
  asunto: string;
  mensaje: string;
  tipo: string;
  id_usuario_condominio: number;
  id_condominio: number;
  correo: string | null;
  nombre_condominio: string | null;
  activo: boolean;
  usar_email: boolean;
  usar_push: boolean;
};

/**
 * Despachador de notificaciones.
 *
 * Corre cada minuto y hace tres cosas:
 *  1. Promueve las notificaciones `PROGRAMADA` cuya hora llego.
 *  2. Procesa las entregas pendientes (correo y push) con reintentos.
 *  3. Marca `FALLIDA` la notificacion cuyas entregas se agotaron.
 *
 * Reclama con `FOR UPDATE SKIP LOCKED`, asi que puede correr en varias
 * instancias del backend sin enviar dos veces la misma entrega.
 *
 * Degradacion por cuota: si se alcanza `MAIL_MAX_DIARIO`, las entregas de
 * correo se marcan `OMITIDA` y el usuario conserva la notificacion interna y
 * el push. Nunca se pierde el aviso.
 */
@Injectable()
export class NotificacionesDespachadorService {
  private readonly logger = new Logger(NotificacionesDespachadorService.name);
  private ejecutando = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly mailCupo: MailCupoService,
    private readonly pushService: PushService,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async despachar(): Promise<void> {
    // Una corrida puede durar mas de un minuto (Resend tarda). Sin este
    // candado, el siguiente tick se solaparia y duplicaria envios.
    if (this.ejecutando) {
      return;
    }

    this.ejecutando = true;
    try {
      await this.promoverProgramadas();
      await this.liberarColgadas();
      await this.procesarLote();
    } catch (error) {
      this.logger.error(`Fallo el despacho de notificaciones: ${(error as Error).message}`);
    } finally {
      this.ejecutando = false;
    }
  }

  /** Notificaciones programadas que ya vencieron pasan a la bandeja. */
  private async promoverProgramadas(): Promise<void> {
    const rows = await this.dataSource.query(
      `
      UPDATE notificaciones
      SET estado = 'ENVIADA',
          fecha_envio = COALESCE(fecha_envio, NOW())
      WHERE estado = 'PROGRAMADA'
        AND fecha_programada <= NOW()
      RETURNING id_notificacion, id_usuario_condominio, tipo, asunto, visible_en_bandeja
      `,
    );

    // `query()` devuelve `[filas, conteo]` en una mutacion: sin normalizar,
    // `lista.length` seria siempre 2 y se emitirian eventos fantasma.
    const lista = filasDe(rows);
    if (lista.length === 0) {
      return;
    }

    for (const fila of lista) {
      if (!fila.visible_en_bandeja) {
        continue;
      }

      const idUsuarioCondominio = Number(fila.id_usuario_condominio);
      const idCondominio = await this.condominioDe(idUsuarioCondominio);
      if (idCondominio) {
        this.notificacionesGateway.emitNotificacionChanged(idCondominio, idUsuarioCondominio, {
          tipo: 'PROGRAMADA_ENVIADA',
          idNotificacion: Number(fila.id_notificacion),
          asunto: String(fila.asunto),
        });
      }
    }

    this.logger.log(`Notificaciones programadas promovidas: ${lista.length}`);
  }

  /** Libera entregas que quedaron tomadas por un proceso que ya no existe. */
  private async liberarColgadas(): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE notificacion_entregas
      SET estado = 'PENDIENTE', reclamado_en = NULL, actualizado_en = NOW()
      WHERE estado = 'EN_PROCESO'
        AND (reclamado_en IS NULL OR reclamado_en < NOW() - ($1 || ' minutes')::interval)
      `,
      [String(RECLAMO_MINUTOS)],
    );
  }

  private async procesarLote(): Promise<void> {
    const reclamadas = await this.dataSource.query(
      `
      WITH lote AS (
        SELECT id_entrega
        FROM notificacion_entregas
        WHERE estado = 'PENDIENTE'
          AND proximo_intento_en <= NOW()
        ORDER BY proximo_intento_en
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notificacion_entregas e
      SET estado = 'EN_PROCESO',
          reclamado_en = NOW(),
          actualizado_en = NOW()
      FROM lote
      WHERE e.id_entrega = lote.id_entrega
      RETURNING e.id_entrega
      `,
      [TAMANO_LOTE],
    );

    const ids = filasDe(reclamadas)
      .map((fila) => Number(fila.id_entrega))
      .filter((id) => Number.isInteger(id));

    if (ids.length === 0) {
      return;
    }

    const entregas = await this.cargarEntregas(ids);

    // El cupo se consulta UNA vez por lote y se descuenta en memoria: contar por
    // cada correo serian 25 consultas extra que ademas no verian las filas
    // todavia sin confirmar de esta misma tanda.
    const cupo = await this.mailCupo.estado();
    let restantes = cupo.limite === 0 ? Number.POSITIVE_INFINITY : Math.max(0, cupo.limite - cupo.usados);

    for (const entrega of entregas) {
      try {
        if (!entrega.activo) {
          await this.cerrar(entrega.id_entrega, 'OMITIDA', 'notificaciones-desactivadas');
          continue;
        }

        if (entrega.canal === 'EMAIL') {
          if (!entrega.usar_email) {
            await this.cerrar(entrega.id_entrega, 'OMITIDA', 'canal-email-desactivado');
            continue;
          }

          if (restantes <= 0) {
            // Degradacion: la interna y el push siguen funcionando.
            await this.cerrar(entrega.id_entrega, 'OMITIDA', 'tope-diario-de-correo-alcanzado');
            continue;
          }

          if (!entrega.correo) {
            await this.cerrar(entrega.id_entrega, 'OMITIDA', 'usuario-sin-correo');
            continue;
          }

          const html = plantillaNotificacion({
            asunto: entrega.asunto,
            mensaje: entrega.mensaje,
            nombreCondominio: entrega.nombre_condominio,
            urlAccion: this.urlPanel(),
          });

          const resultado = await this.mailService.enviar(
            entrega.correo,
            `${entrega.asunto} - Elyx`,
            html,
            {
              idempotencyKey: `entrega-${entrega.id_entrega}`,
              etiqueta: entrega.tipo,
            },
          );

          if (resultado.ok) {
            restantes -= 1;
            await this.cerrar(entrega.id_entrega, 'ENVIADA');
          } else {
            await this.reintentar(entrega, resultado.error ?? 'error-desconocido');
          }
          continue;
        }

        // PUSH
        if (!entrega.usar_push) {
          await this.cerrar(entrega.id_entrega, 'OMITIDA', 'canal-push-desactivado');
          continue;
        }

        if (!this.pushService.configurado()) {
          await this.cerrar(entrega.id_entrega, 'OMITIDA', 'push-no-configurado');
          continue;
        }

        const resultado = await this.pushService.enviar(entrega.id_usuario_condominio, {
          titulo: entrega.asunto,
          cuerpo: entrega.mensaje,
          url: '/inicio?notificaciones=1',
          tag: `elyx-${entrega.id_notificacion}`,
        });

        if (resultado.sinSuscripciones) {
          await this.cerrar(entrega.id_entrega, 'OMITIDA', 'sin-dispositivos-suscritos');
          continue;
        }

        if (resultado.enviados > 0) {
          await this.cerrar(entrega.id_entrega, 'ENVIADA');
        } else {
          await this.reintentar(
            entrega,
            `push-fallido: ${resultado.errores} error(es), ${resultado.eliminados} suscripcion(es) eliminada(s)`,
          );
        }
      } catch (error) {
        await this.reintentar(entrega, (error as Error).message);
      }
    }

    await this.marcarNotificacionesFallidas(entregas.map((entrega) => entrega.id_notificacion));
  }

  private async cargarEntregas(ids: number[]): Promise<EntregaPendiente[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        e.id_entrega,
        e.id_notificacion,
        e.canal,
        e.intentos,
        n.asunto,
        n.mensaje,
        n.tipo,
        n.id_usuario_condominio,
        uc.id_condominio,
        u.correo,
        co.nombre AS nombre_condominio,
        COALESCE(c.activo, TRUE) AS activo,
        COALESCE(c.usar_email, TRUE) AS usar_email,
        COALESCE(c.usar_push, TRUE) AS usar_push
      FROM notificacion_entregas e
      INNER JOIN notificaciones n ON n.id_notificacion = e.id_notificacion
      INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = n.id_usuario_condominio
      INNER JOIN usuarios u ON u.id_usuario = uc.id_usuario
      INNER JOIN condominios co ON co.id_condominio = uc.id_condominio
      LEFT JOIN config_notificaciones c ON c.id_usuario_condominio = n.id_usuario_condominio
      WHERE e.id_entrega = ANY($1::int[])
      `,
      [ids],
    );

    return (Array.isArray(rows) ? filasDe(rows) : []).map((fila) => ({
      id_entrega: Number(fila.id_entrega),
      id_notificacion: Number(fila.id_notificacion),
      canal: String(fila.canal) as 'EMAIL' | 'PUSH',
      intentos: Number(fila.intentos),
      asunto: String(fila.asunto),
      mensaje: String(fila.mensaje),
      tipo: String(fila.tipo),
      id_usuario_condominio: Number(fila.id_usuario_condominio),
      id_condominio: Number(fila.id_condominio),
      correo: fila.correo ? String(fila.correo) : null,
      nombre_condominio: fila.nombre_condominio ? String(fila.nombre_condominio) : null,
      activo: Boolean(fila.activo),
      usar_email: Boolean(fila.usar_email),
      usar_push: Boolean(fila.usar_push),
    }));
  }

  private async cerrar(
    idEntrega: number,
    estado: 'ENVIADA' | 'FALLIDA' | 'OMITIDA',
    error?: string,
  ): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE notificacion_entregas
      SET estado = $2::varchar,
          -- El parametro $2 se usa en una asignacion (varchar) y en una
          -- comparacion (text): sin el cast explicito Postgres falla con
          -- "inconsistent types deduced for parameter $2".
          enviada_en = CASE WHEN $2::varchar = 'ENVIADA' THEN NOW() ELSE enviada_en END,
          ultimo_error = $3,
          reclamado_en = NULL,
          actualizado_en = NOW()
      WHERE id_entrega = $1
      `,
      [idEntrega, estado, error ?? null],
    );
  }

  /** Suma un intento y agenda el siguiente; al agotarlos marca `FALLIDA`. */
  private async reintentar(entrega: EntregaPendiente, error: string): Promise<void> {
    const intentos = entrega.intentos + 1;

    if (intentos >= MAX_INTENTOS) {
      await this.dataSource.query(
        `
        UPDATE notificacion_entregas
        SET estado = 'FALLIDA',
            intentos = $2,
            ultimo_error = $3,
            reclamado_en = NULL,
            actualizado_en = NOW()
        WHERE id_entrega = $1
        `,
        [entrega.id_entrega, intentos, error.slice(0, 500)],
      );
      this.logger.warn(
        `Entrega ${entrega.id_entrega} (${entrega.canal}) fallida tras ${intentos} intentos: ${error}`,
      );
      return;
    }

    const minutos = BACKOFF_MINUTOS[Math.min(intentos - 1, BACKOFF_MINUTOS.length - 1)];

    await this.dataSource.query(
      `
      UPDATE notificacion_entregas
      SET estado = 'PENDIENTE',
          intentos = $2,
          proximo_intento_en = NOW() + ($3 || ' minutes')::interval,
          ultimo_error = $4,
          reclamado_en = NULL,
          actualizado_en = NOW()
      WHERE id_entrega = $1
      `,
      [entrega.id_entrega, intentos, String(minutos), error.slice(0, 500)],
    );
  }

  /**
   * Una notificacion cuyas entregas terminaron todas en `FALLIDA` se marca
   * `FALLIDA`. Si al menos una salio (correo o push), se queda `ENVIADA`.
   */
  private async marcarNotificacionesFallidas(idsNotificacion: number[]): Promise<void> {
    const ids = Array.from(new Set(idsNotificacion.filter((id) => Number.isInteger(id))));
    if (ids.length === 0) {
      return;
    }

    await this.dataSource.query(
      `
      UPDATE notificaciones n
      SET estado = 'FALLIDA'
      WHERE n.id_notificacion = ANY($1::int[])
        AND n.estado = 'ENVIADA'
        AND EXISTS (
          SELECT 1 FROM notificacion_entregas e
          WHERE e.id_notificacion = n.id_notificacion AND e.estado = 'FALLIDA'
        )
        AND NOT EXISTS (
          SELECT 1 FROM notificacion_entregas e
          WHERE e.id_notificacion = n.id_notificacion
            AND e.estado IN ('PENDIENTE', 'EN_PROCESO', 'ENVIADA')
        )
      `,
      [ids],
    );
  }

  private async condominioDe(idUsuarioCondominio: number): Promise<number | null> {
    const rows = await this.dataSource.query(
      `SELECT id_condominio FROM usuarios_condominios WHERE id_usuario_condominio = $1 LIMIT 1`,
      [idUsuarioCondominio],
    );
    const fila = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    return fila ? Number(fila.id_condominio) : null;
  }

  private urlPanel(): string {
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'https://elyx-app.com')
      .replace(/\/+$/, '');
    return `${base}/inicio`;
  }
}
