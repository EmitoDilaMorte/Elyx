/** Resolucion de la URL base del backend, compartida por los servicios. */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (raw && raw.length > 0) {
    return raw.endsWith('/api') ? raw : `${raw}/api`;
  }
  return '/api';
}

/** Host del backend (sin `/api`), usado por Socket.IO. */
export function getApiHostUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (raw && raw.length > 0) {
    return raw.endsWith('/api') ? raw.slice(0, -4) : raw;
  }
  return '';
}
