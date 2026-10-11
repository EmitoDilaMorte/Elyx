import { HttpException, HttpStatus } from '@nestjs/common';

export type RateLimitDetail = {
  message?: string;
  retryAfterSeconds: number;
};

/**
 * Excepcion 429 unificada para todas las estrategias de limitacion
 * (throttler HTTP y bloqueo progresivo de inicio de sesion).
 *
 * Siempre lleva adjunto `retryAfterSeconds`, de modo que
 * RateLimitExceptionFilter pueda emitir la cabecera `Retry-After`.
 */
export class RateLimitException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message?: string) {
    const retryAfter = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds)
      : 1;

    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: message ?? 'Demasiadas solicitudes. Intenta de nuevo mas tarde.',
        retryAfter: retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    this.retryAfterSeconds = retryAfter;
  }
}
