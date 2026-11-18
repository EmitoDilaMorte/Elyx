/** Canales de entrega real. `INTERNA` es la bandeja y no genera entrega. */
export type CanalEntrega = 'EMAIL' | 'PUSH';

export type EstadoNotificacion = 'PROGRAMADA' | 'ENVIADA' | 'FALLIDA' | 'LEIDA';

export type EstadoEntrega = 'PENDIENTE' | 'EN_PROCESO' | 'ENVIADA' | 'FALLIDA' | 'OMITIDA';

/**
 * Seleccion de canales de una notificacion.
 *
 * `undefined` en un campo significa "lo que diga la configuracion del usuario".
 * Un valor explicito lo sobrescribe: util para avisos, donde el administrador
 * decide si ademas se manda correo.
 */
export type CanalesNotificacion = {
  interna?: boolean;
  email?: boolean;
  push?: boolean;
};

export type CrearNotificacionInput = {
  idCondominio: number;
  idUsuarioCondominio: number;
  tipo: string;
  asunto: string;
  mensaje: string;
  /** Fecha de envio. Si se omite o es pasada, la notificacion sale de inmediato. */
  fechaProgramada?: string | Date;
  /** Clave unica para que un proceso automatico no duplique la fila. */
  claveDedupe?: string;
  /** Sobrescribe los canales de la configuracion del usuario. */
  canales?: CanalesNotificacion;
  idConfig?: number | null;
};

export type NotificacionRecord = {
  idNotificacion: number;
  idCondominio: number;
  idUsuarioCondominio: number;
  tipo: string;
  /** Canal "principal" para la bandeja: INTERNA si es visible, EMAIL si no. */
  canal: string;
  asunto: string;
  mensaje: string;
  fechaProgramada: string;
  fechaEnvio: string | null;
  leidaEn: string | null;
  estado: EstadoNotificacion;
  idConfig: number | null;
  /** Canales con entrega registrada (correo/push). */
  canales: CanalEntrega[];
  /** Estado de cada entrega, en el mismo orden que `canales`. */
  entregas: Array<{ canal: CanalEntrega; estado: EstadoEntrega; error: string | null }>;
};

export type ListarNotificacionesInput = {
  idUsuarioCondominio: number;
  soloNoLeidas?: boolean;
  page?: number;
  pageSize?: number;
};

export type PaginaNotificaciones = {
  items: NotificacionRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ResumenNotificaciones = {
  noLeidas: number;
  items: NotificacionRecord[];
};

/** Configuracion efectiva de un destinatario (con defaults si no tiene fila). */
export type ConfigNotificacionUsuario = {
  idConfig: number | null;
  activo: boolean;
  interna: boolean;
  email: boolean;
  push: boolean;
};

export const CANALES_ENTREGA: CanalEntrega[] = ['EMAIL', 'PUSH'];
