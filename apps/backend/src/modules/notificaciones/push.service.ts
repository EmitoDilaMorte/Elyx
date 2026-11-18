import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as webpush from 'web-push';
import { conteoDe } from '../../common/db/resultado-query';

export type PushSuscripcionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushPayload = {
  /** Titulo de la notificacion del sistema. */
  titulo: string;
  /** Texto corto. Los navegadores truncan alrededor de 120 caracteres. */
  cuerpo: string;
  /** Ruta interna que se abre al pulsar la notificacion. */
  url?: string;
  /** Etiqueta para agrupar/reemplazar notificaciones del mismo tipo. */
  tag?: string;
};

export type ResultadoPush = {
  enviados: number;
  eliminados: number;
  errores: number;
  /** `true` si no hay suscripciones para el usuario. */
  sinSuscripciones: boolean;
};

/** Limite del servicio push: 4 KB por payload. Se recorta con margen. */
const MAX_PAYLOAD_BYTES = 3800;

/**
 * Web Push (VAPID).
 *
 * Las suscripciones son por navegador. Un usuario puede tener varias (telefono,
 * laptop, navegador de trabajo) y todas reciben la misma notificacion.
 *
 * Esta clase no decide *cuando* notificar: solo entrega. La logica de
 * preferencias, reintentos y degradacion vive en el despachador.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private configuradoEnProceso = false;

  constructor(private readonly dataSource: DataSource) {}

  configurado(): boolean {
    return Boolean(this.clavePublica() && (process.env.VAPID_PRIVATE_KEY ?? '').trim());
  }

  clavePublica(): string | null {
    const clave = (process.env.VAPID_PUBLIC_KEY ?? '').trim();
    return clave || null;
  }

  /** Falla con 503 si no hay llaves: el frontend lo muestra como "no disponible". */
  assertConfigurado(): void {
    if (!this.configurado()) {
      throw new ServiceUnavailableException(
        'Las notificaciones del navegador no estan configuradas en el servidor.',
      );
    }
  }

  /**
   * Registra o actualiza una suscripcion.
   *
   * `ON CONFLICT (endpoint)` reasigna el dispositivo al usuario actual: si dos
   * personas usan el mismo navegador, la ultima que activa push es la que
   * recibe. Sin esto, el segundo usuario quedaria sin notificaciones o, peor,
   * recibiria las del primero.
   */
  async suscribir(
    idUsuarioCondominio: number,
    input: PushSuscripcionInput,
    userAgent?: string | null,
  ): Promise<void> {
    this.assertConfigurado();

    const endpoint = (input?.endpoint ?? '').trim();
    const p256dh = (input?.keys?.p256dh ?? '').trim();
    const auth = (input?.keys?.auth ?? '').trim();

    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('La suscripcion push esta incompleta.');
    }
    if (!/^https:\/\//.test(endpoint)) {
      throw new BadRequestException('El endpoint de la suscripcion no es valido.');
    }

    await this.dataSource.query(
      `
      INSERT INTO notificacion_push_suscripciones (
        id_usuario_condominio, endpoint, p256dh, auth, user_agent
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (endpoint) DO UPDATE SET
        id_usuario_condominio = EXCLUDED.id_usuario_condominio,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        actualizado_en = NOW(),
        fallos_consecutivos = 0
      `,
      [idUsuarioCondominio, endpoint, p256dh, auth, (userAgent ?? '').slice(0, 300) || null],
    );
  }

  /**
   * Borra una suscripcion. Se filtra por usuario para que nadie pueda dar de
   * baja el dispositivo de otra persona conociendo el endpoint.
   */
  async desuscribir(idUsuarioCondominio: number, endpoint: string): Promise<boolean> {
    const limpio = (endpoint ?? '').trim();
    if (!limpio) {
      return false;
    }

    const rows = await this.dataSource.query(
      `
      DELETE FROM notificacion_push_suscripciones
      WHERE endpoint = $1 AND id_usuario_condominio = $2
      RETURNING id_suscripcion
      `,
      [limpio, idUsuarioCondominio],
    );

    return conteoDe(rows) > 0;
  }

  async contar(idUsuarioCondominio: number): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM notificacion_push_suscripciones WHERE id_usuario_condominio = $1`,
      [idUsuarioCondominio],
    );
    const fila = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    return fila ? Number(fila.total) : 0;
  }

  /**
   * Envia el payload a todos los dispositivos del usuario.
   *
   * Nunca lanza: devuelve el conteo para que el despachador decida si la
   * entrega se considera exitosa. Una suscripcion que responde 404/410 esta
   * muerta y se borra en el acto; los demas errores solo suman un fallo.
   */
  async enviar(idUsuarioCondominio: number, payload: PushPayload): Promise<ResultadoPush> {
    const resultado: ResultadoPush = {
      enviados: 0,
      eliminados: 0,
      errores: 0,
      sinSuscripciones: false,
    };

    if (!this.configurado()) {
      resultado.errores = 1;
      return resultado;
    }

    const suscripciones = await this.dataSource.query(
      `
      SELECT id_suscripcion, endpoint, p256dh, auth
      FROM notificacion_push_suscripciones
      WHERE id_usuario_condominio = $1
      `,
      [idUsuarioCondominio],
    );

    const lista = Array.isArray(suscripciones)
      ? (suscripciones as Array<Record<string, unknown>>)
      : [];

    if (lista.length === 0) {
      resultado.sinSuscripciones = true;
      return resultado;
    }

    this.inicializar();
    const cuerpo = this.serializar(payload);

    for (const suscripcion of lista) {
      const idSuscripcion = Number(suscripcion.id_suscripcion);
      const endpoint = String(suscripcion.endpoint);

      try {
        await webpush.sendNotification(
          {
            endpoint,
            keys: {
              p256dh: String(suscripcion.p256dh),
              auth: String(suscripcion.auth),
            },
          },
          cuerpo,
          { TTL: 60 * 60 * 24 },
        );

        resultado.enviados += 1;
        await this.dataSource.query(
          `
          UPDATE notificacion_push_suscripciones
          SET ultimo_exito_en = NOW(), actualizado_en = NOW(), fallos_consecutivos = 0
          WHERE id_suscripcion = $1
          `,
          [idSuscripcion],
        );
      } catch (error) {
        const status = this.statusDe(error);

        // 404/410 = el navegador revoco el permiso o desinstalo la PWA.
        if (status === 404 || status === 410) {
          await this.dataSource.query(
            `DELETE FROM notificacion_push_suscripciones WHERE id_suscripcion = $1`,
            [idSuscripcion],
          );
          resultado.eliminados += 1;
          continue;
        }

        resultado.errores += 1;
        this.logger.warn(`Push fallido (${status ?? 'sin-status'}) para ${endpoint.slice(0, 60)}`);

        await this.dataSource.query(
          `
          UPDATE notificacion_push_suscripciones
          SET fallos_consecutivos = fallos_consecutivos + 1, actualizado_en = NOW()
          WHERE id_suscripcion = $1
          `,
          [idSuscripcion],
        );

        // Un endpoint que falla 5 veces seguidas ya no sirve: se libera la fila
        // para que la tabla no crezca con dispositivos fantasma.
        await this.dataSource.query(
          `
          DELETE FROM notificacion_push_suscripciones
          WHERE id_suscripcion = $1 AND fallos_consecutivos >= 5
          `,
          [idSuscripcion],
        );
      }
    }

    return resultado;
  }

  private inicializar(): void {
    if (this.configuradoEnProceso) {
      return;
    }

    webpush.setVapidDetails(
      (process.env.VAPID_SUBJECT ?? 'mailto:no-reply@elyx-app.com').trim(),
      (process.env.VAPID_PUBLIC_KEY ?? '').trim(),
      (process.env.VAPID_PRIVATE_KEY ?? '').trim(),
    );
    this.configuradoEnProceso = true;
  }

  /** Recorta el payload si se pasa del limite del servicio push. */
  private serializar(payload: PushPayload): string {
    const base: PushPayload = {
      titulo: this.recortar(payload.titulo, 90),
      cuerpo: this.recortar(payload.cuerpo, 180),
      url: payload.url,
      tag: payload.tag,
    };

    let cuerpo = JSON.stringify(base);
    if (Buffer.byteLength(cuerpo, 'utf8') <= MAX_PAYLOAD_BYTES) {
      return cuerpo;
    }

    base.cuerpo = this.recortar(base.cuerpo, 80);
    cuerpo = JSON.stringify(base);
    return cuerpo;
  }

  private recortar(valor: string, maximo: number): string {
    const texto = String(valor ?? '').trim();
    return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
  }

  private statusDe(error: unknown): number | null {
    const posible = error as { statusCode?: number; status?: number };
    const status = posible?.statusCode ?? posible?.status;
    return typeof status === 'number' ? status : null;
  }
}
