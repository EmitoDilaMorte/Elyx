import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'skipCsrf';

/**
 * Exime un handler del control CSRF.
 *
 * Solo para endpoints publicos que no dependen de cookies de sesion
 * (telemetria, health). Los endpoints de autenticacion SI se validan: el
 * cliente obtiene el token en `GET /api/auth/csrf` al montar la aplicacion.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
