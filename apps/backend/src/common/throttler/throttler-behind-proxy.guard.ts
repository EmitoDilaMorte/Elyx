import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail, normalizeIp } from '@nestjs/throttler';
import { RateLimitException } from './rate-limit.exception';

/**
 * Guard global de rate limiting.
 *
 * Dos diferencias clave respecto al ThrottlerGuard por defecto:
 *  1. `getTracker` identifica al usuario autenticado (`user:<id>`) cuando el
 *     JwtAuthGuard ya poblo `request.user`, y cae a la IP real en caso
 *     contrario. Asi los limites por usuario y por IP no se mezclan.
 *  2. `throwThrottlingException` responde 429 incluyendo `Retry-After`,
 *     calculado desde `timeToBlockExpire`/`timeToExpire`.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req?.user as { sub?: number | string } | undefined;
    if (user?.sub !== undefined && user?.sub !== null) {
      return `user:${user.sub}`;
    }

    return `ip:${this.resolveClientIp(req)}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Ojo: en @nestjs/throttler v6 `timeToExpire` / `timeToBlockExpire` ya
    // vienen expresados en SEGUNDOS (tanto el storage en memoria como el
    // adaptador de Redis), no en milisegundos.
    const windowSeconds = throttlerLimitDetail.timeToBlockExpire > 0
      ? throttlerLimitDetail.timeToBlockExpire
      : throttlerLimitDetail.timeToExpire;

    throw new RateLimitException(Math.max(1, Math.ceil(windowSeconds)));
  }

  private resolveClientIp(req: Record<string, any>): string {
    const headers = (req?.headers ?? {}) as Record<string, unknown>;
    const forwarded = this.firstHeaderValue(headers['cf-connecting-ip'] ?? headers['x-forwarded-for']);
    const ips = Array.isArray(req?.ips) ? (req.ips as string[]) : [];
    const ip = forwarded ?? (ips.length > 0 ? ips[0] : undefined) ?? req?.ip ?? 'unknown';

    return normalizeIp(String(ip));
  }

  private firstHeaderValue(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.split(',')[0].trim();
    }
    if (Array.isArray(value) && value.length > 0) {
      return String(value[0]).split(',')[0].trim();
    }
    return undefined;
  }
}
