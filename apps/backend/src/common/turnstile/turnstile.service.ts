import { Injectable, Logger } from '@nestjs/common';

export type TurnstileVerifyResult = {
  success: boolean;
  /** true cuando la verificacion se omitio a proposito (desarrollo). */
  skipped?: boolean;
  /** Motivo tecnico para logs; nunca se expone al cliente. */
  reason?: string;
  errorCodes?: string[];
};

type SiteverifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
};

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Verificacion server-side de Cloudflare Turnstile (Siteverify).
 *
 * Politica de fallo:
 *  - `TURNSTILE_ENABLED=true`  -> siempre fail-closed (valida o rechaza).
 *  - `TURNSTILE_ENABLED=false` -> fail-open SOLO fuera de produccion.
 *                                 En produccion es fail-closed.
 *
 * El client-side widget nunca es suficiente: un bot puede llamar a la API
 * directamente, por eso el backend valida el token antes de operar.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  private isEnabled(): boolean {
    return process.env.TURNSTILE_ENABLED === 'true';
  }

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private getSecret(): string {
    return (process.env.TURNSTILE_SECRET_KEY ?? '').trim();
  }

  async verify(token: string | null | undefined, remoteip?: string): Promise<TurnstileVerifyResult> {
    const enabled = this.isEnabled();
    const secret = this.getSecret();

    // Sin verificacion habilitada: fail-open unicamente en desarrollo.
    if (!enabled) {
      if (!this.isProduction()) {
        this.logger.warn(
          'TURNSTILE_ENABLED=false: se omite la verificacion de CAPTCHA (solo permitido en desarrollo).',
        );
        return { success: true, skipped: true, reason: 'disabled-in-development' };
      }

      this.logger.error(
        'TURNSTILE_ENABLED no esta en "true" y NODE_ENV=production: la verificacion rechaza la solicitud (fail-closed).',
      );
      return { success: false, reason: 'disabled-in-production' };
    }

    if (!secret) {
      this.logger.error('TURNSTILE_ENABLED=true pero TURNSTILE_SECRET_KEY no esta configurada (fail-closed).');
      return { success: false, reason: 'missing-secret' };
    }

    const cleanToken = typeof token === 'string' ? token.trim() : '';
    if (!cleanToken) {
      return { success: false, reason: 'missing-token' };
    }
    if (cleanToken.length > MAX_TOKEN_LENGTH) {
      return { success: false, reason: 'token-too-long' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          response: cleanToken,
          ...(remoteip ? { remoteip } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.error(`Siteverify respondio HTTP ${response.status}.`);
        return { success: false, reason: `siteverify-http-${response.status}` };
      }

      const payload = (await response.json()) as SiteverifyResponse;
      const errorCodes = Array.isArray(payload['error-codes']) ? payload['error-codes'] : [];

      if (payload.success === true) {
        return { success: true, errorCodes };
      }

      this.logger.warn(`Turnstile rechazo el token: ${errorCodes.join(', ') || 'sin codigos'}.`);
      return { success: false, reason: 'validation-failed', errorCodes };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        aborted ? 'Siteverify excedio el tiempo de espera.' : `Error al contactar Siteverify: ${String(error)}`,
      );
      // Error de red/servicio de Cloudflare: fail-closed (no se puede confirmar el token).
      return { success: false, reason: aborted ? 'timeout' : 'network-error' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
