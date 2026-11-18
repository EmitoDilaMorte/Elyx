import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type EstadoCupoCorreo = {
  /** Tope configurado. `0` significa sin limite. */
  limite: number;
  /** Correos de notificacion enviados hoy. */
  usados: number;
  /** Envios que aun se pueden hacer hoy. `null` cuando no hay tope. */
  restantes: number | null;
  /** `true` cuando ya no se puede enviar mas por hoy. */
  agotado: boolean;
};

/**
 * Tope diario de correos de notificacion.
 *
 * Existe por dos razones:
 *  - Proteger la cuota del proveedor (Resend gratuito son ~3 000 al mes). Un
 *    aviso enviado a 200 unidades consume 200 correos de golpe.
 *  - Evitar que un error de configuracion (un cron que se dispara en bucle)
 *    queme la cuota en minutos.
 *
 * Solo cuenta correos de NOTIFICACION (`notificacion_entregas`). Los correos
 * de seguridad (recuperacion de contrasena, codigo de MFA) y los de alta
 * (invitacion, verificacion) NO pasan por aqui: nunca deben bloquearse.
 *
 * La degradacion la aplica el despachador: cuando el cupo se agota, la entrega
 * de correo se marca `OMITIDA` y el usuario conserva la notificacion interna y
 * el push.
 */
@Injectable()
export class MailCupoService {
  private readonly logger = new Logger(MailCupoService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Tope configurado en `MAIL_MAX_DIARIO`. `0` o negativo = sin limite. */
  limite(): number {
    const valor = Number(process.env.MAIL_MAX_DIARIO ?? 500);
    if (!Number.isFinite(valor) || valor <= 0) {
      return 0;
    }
    return Math.floor(valor);
  }

  /** Correos de notificacion efectivamente enviados desde las 00:00 local del servidor. */
  async usadosHoy(): Promise<number> {
    try {
      const rows = await this.dataSource.query(
        `
        SELECT COUNT(*)::int AS total
        FROM notificacion_entregas
        WHERE canal = 'EMAIL'
          AND enviada_en IS NOT NULL
          AND enviada_en >= CURRENT_DATE
        `,
      );
      const fila = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
      return fila ? Number(fila.total) : 0;
    } catch (error) {
      // Si la tabla aun no existe (migracion pendiente) no se bloquea el envio:
      // el tope es una proteccion, no un requisito funcional.
      this.logger.warn(`No fue posible leer el cupo de correo: ${(error as Error).message}`);
      return 0;
    }
  }

  async estado(): Promise<EstadoCupoCorreo> {
    const limite = this.limite();
    const usados = await this.usadosHoy();

    if (limite === 0) {
      return { limite, usados, restantes: null, agotado: false };
    }

    const restantes = Math.max(0, limite - usados);
    return { limite, usados, restantes, agotado: restantes === 0 };
  }

  /**
   * `true` si aun cabe al menos un correo.
   *
   * `reservados` descuenta los correos que se van a mandar en la misma tanda
   * y todavia no aparecen en la base (se marcan `ENVIADA` al terminar).
   */
  async hayCupo(reservados = 0): Promise<boolean> {
    const { limite, usados } = await this.estado();
    if (limite === 0) {
      return true;
    }
    return usados + reservados < limite;
  }
}
