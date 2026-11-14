import { apiRequest } from './backendApi.service';

export type InvitacionEstadoResponse = {
  invitacion: {
    idInvitacion: number;
    estado: 'ACTIVA' | 'REVOCADA' | 'EXPIRADA';
    motivoCierre: string | null;
    expiracion: string;
    creadaEn: string;
  } | null;
  url: string | null;
  cupo: {
    cupoTotal: number | null;
    unidadesTotales: number;
    unidadesOcupadas: number;
    unidadesLibres: number;
  };
  puedeInvitar: boolean;
  motivoBloqueo: string | null;
  solicitudesPendientes: number;
};

export type SolicitudAlta = {
  idSolicitud: number;
  idCondominio: number;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  telefono: string | null;
  idUnidadPropuesta: number;
  claveUnidad: string | null;
  tipoOcupacion: string;
  estado: 'PENDIENTE' | 'VERIFICADA' | 'APROBADA' | 'RECHAZADA' | 'EXPIRADA';
  esCuentaExistente: boolean;
  motivoRechazo: string | null;
  fechaSolicitud: string;
  fechaResolucion: string | null;
};

export type InvitacionPublicaResponse = {
  nombreCondominio: string;
  direccionCondominio: string | null;
  expiracion: string;
  unidadesLibres: Array<{ idUnidad: number; claveUnidad: string; tipoUnidad: string }>;
};

export type SolicitudInvitacionPayload = {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  correo: string;
  telefono?: string;
  idUnidad: number;
  tipoOcupacion?: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE';
  password?: string;
  captchaToken?: string;
};

export const invitacionesApi = {
  estado(idCondominio: number) {
    return apiRequest<InvitacionEstadoResponse>(`/invitaciones?idCondominio=${idCondominio}`);
  },

  crear(idCondominio: number, idUsuarioCondominio?: number) {
    return apiRequest<{ url: string; expiracion: string; idInvitacion: number }>(
      `/invitaciones?idCondominio=${idCondominio}`,
      { method: 'POST', body: JSON.stringify({ idUsuarioCondominio }) },
    );
  },

  revocar(idCondominio: number) {
    return apiRequest<InvitacionEstadoResponse>(
      `/invitaciones/revocar?idCondominio=${idCondominio}`,
      { method: 'PATCH' },
    );
  },

  solicitudes(idCondominio: number, estado?: string) {
    const filtro = estado ? `&estado=${estado}` : '';
    return apiRequest<SolicitudAlta[]>(
      `/invitaciones/solicitudes?idCondominio=${idCondominio}${filtro}`,
    );
  },

  aprobar(payload: {
    idSolicitud: number;
    idUsuarioCondominioAdmin: number;
    comentario?: string;
  }) {
    return apiRequest<SolicitudAlta>('/invitaciones/solicitudes/aprobar', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  rechazar(payload: {
    idSolicitud: number;
    idUsuarioCondominioAdmin: number;
    comentario?: string;
  }) {
    return apiRequest<SolicitudAlta>('/invitaciones/solicitudes/rechazar', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  publica(token: string) {
    return apiRequest<InvitacionPublicaResponse>(
      `/invitaciones/publica/${encodeURIComponent(token)}`,
    );
  },

  enviarSolicitud(token: string, payload: SolicitudInvitacionPayload) {
    const { captchaToken, ...resto } = payload;
    return apiRequest<{ ok: true; message: string }>(
      `/invitaciones/publica/${encodeURIComponent(token)}/solicitud`,
      { method: 'POST', body: JSON.stringify({ ...resto, captchaToken }) },
    );
  },

  confirmar(token: string, captchaToken?: string) {
    return apiRequest<{ ok: true; estado: string; nombreCondominio: string }>(
      '/invitaciones/publica/confirmar',
      { method: 'POST', body: JSON.stringify({ token, captchaToken }) },
    );
  },

  /**
   * Une al usuario con sesion iniciada al condominio del enlace.
   *
   * Requiere JWT: el backend toma el correo de la sesion y crea la solicitud ya
   * verificada, sin mandar correo de confirmacion (el login ya probo el buzon).
   * El condominio sale del token, no del cuerpo, para que no se pueda unir a
   * otro condominio cambiando un id.
   */
  unirseDesdeToken(token: string, idUnidad: number) {
    return apiRequest<{ ok: true; message: string; estado: string }>(
      `/invitaciones/publica/${encodeURIComponent(token)}/unirse`,
      { method: 'POST', body: JSON.stringify({ idUnidad }) },
    );
  },
};
