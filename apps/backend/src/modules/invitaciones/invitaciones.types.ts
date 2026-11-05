export type EstadoInvitacion = 'ACTIVA' | 'REVOCADA' | 'EXPIRADA';

export type InvitacionEstado = {
  invitacion: {
    idInvitacion: number;
    estado: EstadoInvitacion;
    motivoCierre: string | null;
    expiracion: string;
    creadaEn: string;
  } | null;
  /** URL completa solo se devuelve al crearla o al consultarla el admin. */
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

export type SolicitudAltaRecord = {
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

export type InvitacionPublica = {
  nombreCondominio: string;
  direccionCondominio: string | null;
  expiracion: string;
  unidadesLibres: Array<{ idUnidad: number; claveUnidad: string; tipoUnidad: string }>;
};
