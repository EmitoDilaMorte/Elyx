import { BadRequestException, CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

export function extractClientIp(request: Record<string, any>): string | undefined {
  const headers = (request?.headers ?? {}) as Record<string, unknown>;
  const forwarded = headers['cf-connecting-ip'] ?? headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }

  const ips = Array.isArray(request?.ips) ? (request.ips as string[]) : [];
  if (ips.length > 0) {
    return ips[0];
  }

  return typeof request?.ip === 'string' ? request.ip : undefined;
}

/**
 * Valida el token de Turnstile antes de ejecutar la operacion del controlador.
 *
 * Nota: los guards de Nest se ejecutan ANTES de los pipes, por lo que aqui
 * `request.body` todavia contiene el body crudo (el ValidationPipe con
 * `whitelist: true` aun no lo ha filtrado).
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(private readonly turnstileService: TurnstileService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const body = (request?.body ?? {}) as Record<string, unknown>;

    const token = body.captchaToken ?? body['cf-turnstile-response'];
    const result = await this.turnstileService.verify(
      typeof token === 'string' ? token : undefined,
      extractClientIp(request),
    );

    if (!result.success) {
      this.logger.warn(
        `CAPTCHA rechazado (${result.reason ?? 'desconocido'}): ${(result.errorCodes ?? []).join(', ')}`,
      );
      throw new BadRequestException('Verificacion de seguridad fallida. Intenta de nuevo.');
    }

    return true;
  }
}
