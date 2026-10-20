import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Response } from 'express';
import { CSRF_COOKIE, csrfCookieOptions } from '../auth/session-cookies';

/**
 * CSRF por doble envio con firma HMAC.
 *
 * El token tiene la forma `<nonce>.<firma>`. La cookie no es HttpOnly para que
 * el cliente pueda copiarlo a la cabecera `X-CSRF-Token`; el atacante
 * cross-site puede provocar la peticion, pero no leer la cookie ni la firma.
 */
@Injectable()
export class CsrfService {
  private readonly secret =
    process.env.CSRF_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'elyx-csrf-dev-secret';

  crearToken(): string {
    const nonce = crypto.randomBytes(24).toString('hex');
    const firma = this.firmar(nonce);
    return `${nonce}.${firma}`;
  }

  /** Emite (y rota) el token en la cookie legible. Devuelve el token. */
  emitir(res: Response): string {
    const token = this.crearToken();
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
    return token;
  }

  esValido(token: string | undefined): boolean {
    if (typeof token !== 'string') {
      return false;
    }

    const [nonce, firma] = token.split('.');
    if (!nonce || !firma) {
      return false;
    }

    const esperada = this.firmar(nonce);
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(a, b);
  }

  private firmar(nonce: string): string {
    return crypto.createHmac('sha256', this.secret).update(nonce).digest('base64url').slice(0, 32);
  }
}
