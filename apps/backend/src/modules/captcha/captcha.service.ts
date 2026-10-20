import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';

type DesafioMatematico = {
  respuesta: string;
  scope: string;
};

const TTL_SEGUNDOS = 180;
const MAX_INTENTOS = 3;

/**
 * Segundo CAPTCHA propio: una operacion aritmetica de un solo uso.
 *
 * La respuesta no viaja nunca al cliente; vive en Redis con TTL corto y se
 * invalida al primer acierto o al tercer fallo.
 */
@Injectable()
export class CaptchaService implements OnModuleDestroy {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis no disponible para CAPTCHA: ${String(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async crear(scope = 'general'): Promise<{ challengeId: string; question: string; expiresIn: number }> {
    const izquierdo = crypto.randomInt(2, 20);
    const derecho = crypto.randomInt(2, 20);
    const suma = crypto.randomInt(0, 2) === 1;

    const resultado = suma ? izquierdo + derecho : Math.max(izquierdo, derecho) - Math.min(izquierdo, derecho);
    const operador = suma ? '+' : '-';
    const a = suma ? izquierdo : Math.max(izquierdo, derecho);
    const b = suma ? derecho : Math.min(izquierdo, derecho);

    // El texto incluye "Cuanto es N + M" para que cualquier analizador lo
    // reconozca como desafio aritmetico (el bot clasifica por ese patron).
    const question = `¿Cuanto es ${a} ${operador} ${b}?`;
    const challengeId = crypto.randomBytes(16).toString('hex');

    await this.redis.set(
      `captcha:math:${challengeId}`,
      JSON.stringify({ respuesta: String(resultado), scope } satisfies DesafioMatematico),
      'EX',
      TTL_SEGUNDOS,
    );

    return { challengeId, question, expiresIn: TTL_SEGUNDOS };
  }

  async verificar(challengeId: string, respuesta: string): Promise<void> {
    const clave = `captcha:math:${challengeId}`;
    const raw = await this.redis.get(clave);

    if (!raw) {
      throw new BadRequestException('La verificacion matematica expiro. Solicita una nueva.');
    }

    const claveIntentos = `captcha:math:intentos:${challengeId}`;
    const intentos = await this.redis.incr(claveIntentos);
    await this.redis.expire(claveIntentos, TTL_SEGUNDOS);

    if (intentos > MAX_INTENTOS) {
      await this.redis.del(clave, claveIntentos);
      throw new BadRequestException('Demasiados intentos en la verificacion matematica. Solicita una nueva.');
    }

    const desafio = JSON.parse(raw) as DesafioMatematico;
    const esperada = Buffer.from(desafio.respuesta);
    const recibida = Buffer.from(String(respuesta ?? '').trim());

    const correcta =
      esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);

    if (!correcta) {
      throw new BadRequestException('La verificacion matematica es incorrecta.');
    }

    await this.redis.del(clave, claveIntentos);
  }

  /** Fallos de login recientes de la cuenta (misma clave que LoginAttemptsService). */
  async fallosRecientes(correo: string): Promise<number> {
    try {
      const valor = await this.redis.get(`login:fail:${correo.trim().toLowerCase()}`);
      return Number(valor ?? 0) || 0;
    } catch {
      return 0;
    }
  }
}
