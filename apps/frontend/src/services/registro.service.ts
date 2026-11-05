import { apiRequest } from './backendApi.service';

export type RegistroCondominioPayload = {
  nombreCondominio: string;
  direccionCondominio?: string;
  numeroUnidades: number;
  prefijoUnidad?: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
  montoCuota: number;
  recargoPorDia: number;
  diaLimitePago: number;
  periodoInicial?: string;
  nombreAdmin: string;
  apellidoPaternoAdmin: string;
  apellidoMaternoAdmin?: string;
  correoAdmin: string;
  telefonoAdmin?: string;
  password: string;
  captchaToken?: string;
};

export type RegistroDisponibilidad = {
  disponible: boolean;
  suscripcionRequerida: boolean;
};

export type ResultadoVerificacion = {
  ok: true;
  idCondominio: number;
  nombreCondominio: string;
  estadoCondominio: string;
  unidadesCreadas: number;
  cuotasCreadas: number;
  requierePago: boolean;
};

export type CondominioAdminPayload = {
  nombreCondominio: string;
  direccionCondominio?: string;
  numeroUnidades: number;
  prefijoUnidad?: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
  montoCuota: number;
  recargoPorDia: number;
  diaLimitePago: number;
  periodoInicial?: string;
};

export const registroApi = {
  disponibilidad() {
    return apiRequest<RegistroDisponibilidad>('/registro/disponible');
  },

  /**
   * Alta desde la sesion de un administrador: sin verificacion de correo.
   * Es la via recomendada cuando el correo ya tiene cuenta en Elyx.
   */
  crearComoAdmin(payload: CondominioAdminPayload) {
    return apiRequest<ResultadoVerificacion>('/registro/condominio-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  crear(payload: RegistroCondominioPayload) {
    const { captchaToken, ...resto } = payload;
    return apiRequest<{ ok: true; message: string }>('/registro/condominio', {
      method: 'POST',
      body: JSON.stringify({ ...resto, captchaToken }),
    });
  },

  reenviar(correo: string, captchaToken?: string) {
    return apiRequest<{ ok: true; message: string }>('/registro/reenviar-verificacion', {
      method: 'POST',
      body: JSON.stringify({ correo, captchaToken }),
    });
  },

  verificar(token: string) {
    return apiRequest<ResultadoVerificacion>(
      `/registro/verificar?token=${encodeURIComponent(token)}`,
    );
  },

  estado(idRegistro: number) {
    return apiRequest<{
      idRegistro: number;
      nombreCondominio: string;
      estado: string;
      expiracion: string;
      idCondominio: number | null;
    }>(`/registro/${idRegistro}/estado`);
  },
};
