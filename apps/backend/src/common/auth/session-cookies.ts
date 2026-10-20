import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'elyx_rt';
export const CSRF_COOKIE = 'elyx_csrf';

function esProduccion(): boolean {
  return process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
}

/**
 * Cookie del refresh token: HttpOnly (no la lee JavaScript) y Path acotado a
 * `/api/auth`, de modo que no viaja en cada peticion de negocio.
 */
export function refreshCookieOptions(expira?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: esProduccion(),
    sameSite: 'strict',
    path: '/api/auth',
    ...(expira ? { expires: expira } : {}),
  };
}

/**
 * Cookie CSRF: debe poder leerla JavaScript (doble envio), asi que no es
 * HttpOnly. No contiene informacion del usuario, solo un valor aleatorio
 * firmado con HMAC.
 */
export function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: esProduccion(),
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, token: string, expira: Date): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expira));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
