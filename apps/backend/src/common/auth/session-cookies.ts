import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'elyx_rt';
export const CSRF_COOKIE = 'elyx_csrf';
export const COOKIE_RECORDAR = 'elyx_recordar';

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
 * Vigencia que conserva el navegador entre visitas: se anade como cookie
 * persistente en `POST /auth/refresh` cuando el usuario marco "recordarme".
 */
export const DIAS_COOKIE_RECORDADA = 30;

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

/**
 * Marca de dispositivo de confianza (no es un secreto: no autentica nada por
 * si sola). Como es persistente, el frontend puede recordar la preferencia
 * "mantener sesion iniciada" incluso despues de que caduque la cookie de sesion.
 */
export function setRecordarCookie(res: Response, recordar: boolean): void {
  res.cookie(COOKIE_RECORDAR, recordar ? '1' : '0', {
    httpOnly: false,
    secure: esProduccion(),
    sameSite: 'strict',
    path: '/',
    ...(recordar
      ? { maxAge: DIAS_COOKIE_RECORDADA * 24 * 60 * 60 * 1000 }
      : { maxAge: 0 }),
  });
}

/**
 * Cookie de sesion (sin `expires`): el navegador la descarta al cerrarse, de
 * modo que "no recordarme" no deja sesion abierta entre visitas.
 */
export function setRefreshCookieDeSesion(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
