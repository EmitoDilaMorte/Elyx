import { apiRequest } from './backendApi.service';

/** Datos publicos del condominio (pagina `/condominio/:id`). */
export type CondominioPublico = {
  idCondominio: number;
  nombre: string;
  descripcion: string;
  correoContacto: string | null;
  telefonoContacto: string | null;
  aceptaInvitaciones: boolean;
};

export type EstadoInvitacionPublica =
  | 'DISPONIBLE'
  | 'SIN_CUPO'
  | 'EXPIRADA'
  | 'REVOCADA'
  | 'CONDOMINIO_NO_OPERATIVO';

export type ResolucionInvitacion = {
  estado: EstadoInvitacionPublica;
  /** Mensaje listo para mostrar. `null` cuando el estado es DISPONIBLE. */
  motivo: string | null;
  unidadesLibres: Array<{ idUnidad: number; claveUnidad: string; tipoUnidad: string }>;
  expiracion: string | null;
};

/**
 * Respuesta de `GET /publico/invitaciones/:token`.
 *
 * `condominio` viene en `null` cuando el token no sirve: en ese caso solo hay
 * motivo que mostrar.
 */
export type PaginaInvitacion = {
  condominio: CondominioPublico | null;
  invitacion: ResolucionInvitacion;
};

/**
 * Cliente de la pagina publica.
 *
 * Son endpoints sin autenticacion: los consume tambien quien llega desde un
 * enlace de invitacion sin tener cuenta en Elyx.
 */
export const publicoApi = {
  /** Datos publicos del condominio. Falla con 404 si la pagina esta apagada. */
  condominio(idCondominio: number) {
    return apiRequest<CondominioPublico>(`/publico/condominios/${idCondominio}`);
  },

  /**
   * Resuelve un enlace de invitacion a la pagina completa.
   *
   * Nunca rechaza por un token vencido: devuelve `invitacion.estado` con un
   * `motivo` legible.
   */
  invitacion(token: string) {
    return apiRequest<PaginaInvitacion>(
      `/publico/invitaciones/${encodeURIComponent(token)}`,
    );
  },
};
