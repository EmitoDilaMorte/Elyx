import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

/**
 * Aplica los plazos de conservacion declarados en `docs/politica-privacidad.md`.
 *
 * Hasta ahora la politica prometia plazos (30 dias de telemetria, 12 meses de
 * auditoria de login, 30 dias de tokens revocados) pero **ningun proceso los
 * cumplia**: la base crecia sin limite y el documento describia algo que el
 * codigo no hacia. Este servicio cierra esa brecha.
 *
 * Reglas de diseno:
 *  - Solo se purga lo que la politica declara como *maximo*. Los datos
 *    financieros (cuotas, pagos, recibos, reportes) tienen un plazo **minimo**
 *    de 7 anios por obligaciones fiscales: no se tocan aqui.
 *  - Cada tarea es independiente: un fallo en una no impide las demas.
 *  - Todo se puede desactivar o ajustar por variable de entorno, porque un
 *    operador puede tener requisitos distintos a los de la instancia oficial.
 *  - Se borra en lotes acotados (`LIMIT`) para no bloquear la tabla con un
 *    `DELETE` masivo la primera vez que corre sobre una base con historico.
 */
@Injectable()
export class RetencionService {
  private readonly logger = new Logger(RetencionService.name);

  /** Filas por lote. Un borrado unico sobre tablas grandes bloquea escrituras. */
  private static readonly LOTE = 5000;

  constructor(private readonly dataSource: DataSource) {}

  private estaHabilitada(): boolean {
    // Activa por defecto: es una obligacion de la politica, no una opcion.
    return process.env.RETENCION_ENABLED !== 'false';
  }

  private dias(variable: string, porDefecto: number): number {
    const valor = Number(process.env[variable] ?? porDefecto);
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
  }

  /**
   * Purga diaria a las 4:30 AM.
   *
   * Se elige esa hora para no competir con los crons de suscripciones, que
   * corren a las 2 (reconciliacion), 3 (vencimientos), 4 (altas sin pago) y
   * 5 (impago).
   */
  @Cron('0 30 4 * * *')
  async purgar(): Promise<void> {
    if (!this.estaHabilitada()) {
      return;
    }

    const resumen: Record<string, number> = {};

    resumen.tokens = await this.purgarTokensRevocados();
    resumen.telemetria = await this.purgarTelemetria();
    resumen.auditoria = await this.purgarIntentosLogin();
    resumen.resets = await this.purgarResetsUsados();
    resumen.recuperacion = await this.purgarCodigosRecuperacion();

    const total = Object.values(resumen).reduce((suma, valor) => suma + valor, 0);
    if (total > 0) {
      this.logger.log(
        `Retencion aplicada: ${total} filas eliminadas ` +
          `(tokens=${resumen.tokens}, telemetria=${resumen.telemetria}, ` +
          `auditoria=${resumen.auditoria}, resets=${resumen.resets}, ` +
          `recuperacion=${resumen.recuperacion}).`,
      );
    }
  }

  /**
   * Tokens de refresco, 30 dias despues de expirar.
   *
   * Solo se borran los que ya no pueden usarse: expirados o revocados. Un
   * token vivo nunca se toca. El margen posterior a la expiracion existe para
   * poder investigar un robo de sesion reciente.
   */
  private async purgarTokensRevocados(): Promise<number> {
    const dias = this.dias('RETENCION_TOKENS_DIAS', 30);

    return this.borrarEnLotes(
      'refresh_tokens',
      `expira < NOW() - ($1 || ' days')::interval
         OR (revocado = TRUE AND revocado_en IS NOT NULL AND revocado_en < NOW() - ($1 || ' days')::interval)`,
      String(dias),
    );
  }

  /** Telemetria de comportamiento: maximo 30 dias. */
  private async purgarTelemetria(): Promise<number> {
    const dias = this.dias('RETENCION_TELEMETRIA_DIAS', 30);

    return this.borrarEnLotes(
      'behavior_events',
      `creado_en < NOW() - ($1 || ' days')::interval`,
      String(dias),
    );
  }

  /** Auditoria de inicio de sesion: hasta 12 meses. */
  private async purgarIntentosLogin(): Promise<number> {
    const meses = this.dias('RETENCION_AUDITORIA_DIAS', 365);

    return this.borrarEnLotes(
      'intentos_login',
      `fecha < NOW() - ($1 || ' days')::interval`,
      String(meses),
    );
  }

  /**
   * Solicitudes de restablecimiento de contrasena ya usadas o vencidas.
   *
   * Se purgan a los 7 dias: el token deja de servir en cuanto expira y el
   * correo solo es dato personal sin valor forense pasado ese margen.
   */
  private async purgarResetsUsados(): Promise<number> {
    return this.borrarEnLotes(
      'password_resets',
      `(usado = TRUE OR expiracion < NOW()) AND creado_en < NOW() - INTERVAL '7 days'`,
    );
  }

  /**
   * Codigos de recuperacion de MFA consumidos.
   *
   * Los vigentes se conservan mientras el segundo factor este activo (asi lo
   * declara la politica) y se borran al desactivar MFA, que es lo que ya hace
   * `MfaService`. Aqui solo se limpian los que ya se usaron.
   */
  private async purgarCodigosRecuperacion(): Promise<number> {
    return this.borrarEnLotes(
      'mfa_recovery_codes',
      `usado = TRUE AND usado_en IS NOT NULL AND usado_en < NOW() - INTERVAL '90 days'`,
    );
  }

  /**
   * Borra por lotes hasta agotar las filas que cumplen la condicion.
   *
   * `LIMIT` dentro de un `DELETE ... WHERE ctid IN (...)` se apoya en `ctid`
   * en lugar de la clave primaria porque el nombre de la PK varia por tabla.
   * Cada tipo de tabla tiene su propio nombre de columna de fecha, por eso la
   * condicion llega como SQL ya armado.
   */
  private async borrarEnLotes(
    tabla: string,
    condicion: string,
    parametro?: string,
  ): Promise<number> {
    const valores = parametro !== undefined ? [parametro] : [];
    let total = 0;

    try {
      // Tope de iteraciones: si algo impide avanzar (una fila que no se puede
      // borrar por una FK, por ejemplo), no se queda en bucle infinito.
      for (let vuelta = 0; vuelta < 40; vuelta += 1) {
        const resultado = await this.dataSource.query(
          `
          DELETE FROM ${tabla}
          WHERE ctid IN (
            SELECT ctid FROM ${tabla}
            WHERE ${condicion}
            LIMIT ${RetencionService.LOTE}
          )
          RETURNING 1
          `,
          valores,
        );

        const borradas = Array.isArray(resultado) ? resultado.length : 0;
        total += borradas;

        if (borradas < RetencionService.LOTE) {
          break;
        }
      }
    } catch (error) {
      // Una tabla que no existe en esta instalacion (por ejemplo, una base
      // anterior a la migracion de MFA) no debe tumbar el resto de tareas.
      this.logger.warn(
        `No fue posible aplicar retencion en ${tabla}: ${(error as Error).message}`,
      );
    }

    return total;
  }
}
