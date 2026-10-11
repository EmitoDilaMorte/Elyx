import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

export type LoginAttemptOutcome = {
  fallos: number;
  bloqueado: boolean;
  retryAfterSeconds: number;
};

const FALLOS_MAXIMOS = 5;
const VENTANA_FALLOS_SEGUNDOS = 5 * 60; // 5 minutos
const NIVEL_TTL_SEGUNDOS = 24 * 60 * 60; // 24 horas

/** Escalado de bloqueo: 5 min -> 15 min -> 30 min -> 60 min (tope). */
const ESCALADO_BLOQUEO_SEGUNDOS = [5 * 60, 15 * 60, 30 * 60, 60 * 60];

/**
 * Contadores de intentos fallidos de inicio de sesion y bloqueo progresivo.
 *
 * `@nestjs/throttler` cuenta *solicitudes*, no intentos fallidos; por eso el
 * bloqueo por cuenta vive aqui, sobre Redis (claves con TTL que se reinician
 * solas) y con auditoria permanente en PostgreSQL.
 */
@Injectable()
export class LoginAttemptsService implements OnModuleDestroy {
  private readonly logger = new Logger(LoginAttemptsService.name);
  private readonly redis: Redis;

  constructor(private readonly dataSource: DataSource) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis no disponible para intentos de login: ${String(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private normalizar(correo: string): string {
    return correo.trim().toLowerCase();
  }

  private failKey(correo: string): string {
    return `login:fail:${this.normalizar(correo)}`;
  }

  private lockKey(correo: string): string {
    return `login:lock:${this.normalizar(correo)}`;
  }

  private levelKey(correo: string): string {
    return `login:lvl:${this.normalizar(correo)}`;
  }

  /** Segundos restantes de bloqueo para la cuenta (0 si no esta bloqueada). */
  async estaBloqueado(correo: string): Promise<number> {
    try {
      const ttl = await this.redis.ttl(this.lockKey(correo));
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      this.logger.error(`No se pudo consultar el bloqueo en Redis: ${String(error)}`);
      return 0;
    }
  }

  /** Registra un intento fallido y devuelve el estado de bloqueo resultante. */
  async registrarFallo(correo: string, ip: string | undefined, motivo: string): Promise<LoginAttemptOutcome> {
    let fallos = 1;
    let bloqueado = false;
    let retryAfterSeconds = 0;

    try {
      const failKey = this.failKey(correo);
      fallos = await this.redis.incr(failKey);

      if (fallos === 1) {
        await this.redis.expire(failKey, VENTANA_FALLOS_SEGUNDOS);
      }

      if (fallos >= FALLOS_MAXIMOS) {
        const levelKey = this.levelKey(correo);
        const nivel = await this.redis.incr(levelKey);
        await this.redis.expire(levelKey, NIVEL_TTL_SEGUNDOS);

        const indice = Math.min(Math.max(nivel, 1), ESCALADO_BLOQUEO_SEGUNDOS.length) - 1;
        retryAfterSeconds = ESCALADO_BLOQUEO_SEGUNDOS[indice];
        bloqueado = true;

        await this.redis.set(this.lockKey(correo), String(Date.now()), 'EX', retryAfterSeconds);
        await this.redis.del(failKey);
      }
    } catch (error) {
      this.logger.error(`No se pudo registrar el intento fallido en Redis: ${String(error)}`);
      fallos = Math.max(fallos, 1);
    }

    await this.auditar(correo, ip, false, bloqueado ? `bloqueo:${motivo}` : motivo);

    return { fallos, bloqueado, retryAfterSeconds };
  }

  /** Limpia contadores y nivel de bloqueo tras un inicio de sesion exitoso. */
  async registrarExito(correo: string, ip?: string): Promise<void> {
    try {
      await this.redis.del(this.failKey(correo), this.lockKey(correo), this.levelKey(correo));
    } catch (error) {
      this.logger.error(`No se pudieron limpiar los contadores en Redis: ${String(error)}`);
    }

    await this.auditar(correo, ip, true, 'login-exitoso');
  }

  /** Auditoria permanente en la base de datos principal (nunca bloquea el flujo). */
  private async auditar(correo: string, ip: string | undefined, exito: boolean, motivo: string): Promise<void> {
    try {
      await this.dataSource.query(
        `
        INSERT INTO intentos_login (correo, ip, exito, motivo)
        VALUES ($1, $2, $3, $4)
        `,
        [this.normalizar(correo), ip ?? null, exito, motivo.slice(0, 200)],
      );
    } catch (error) {
      this.logger.warn(`No se pudo registrar la auditoria de login: ${String(error)}`);
    }
  }
}
