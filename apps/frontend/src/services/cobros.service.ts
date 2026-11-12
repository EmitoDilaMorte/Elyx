import { apiRequest } from './backendApi.service';

/** Metodo con el que el condominio cobra sus cuotas. */
export type MetodoCobro = 'NINGUNO' | 'SPEI' | 'STRIPE_CONNECT';

export type ConfiguracionCobro = {
  idCondominio: number;
  metodo: MetodoCobro;
  clabe: string | null;
  banco: string | null;
  beneficiario: string | null;
  referenciaPrefijo: string | null;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripeConectadoEn: string | null;
  permitirMsi: boolean;
  comisionTasa: number;
  comisionFijo: number;
  activo: boolean;
  /** `false` sin RFC: la UI deshabilita Connect antes de intentar. */
  puedeUsarConnect: boolean;
  motivoNoConnect: string | null;
  puedeUsarSpei: boolean;
};

export type EstadoConnect = {
  tieneCuenta: boolean;
  stripeAccountId: string | null;
  estadoCapacidad: 'active' | 'restricted' | 'pending' | 'unknown' | 'sin-cuenta';
  puedeCobrar: boolean;
  requisitosPendientes: string[];
  motivo: string | null;
  puedeContinuarOnboarding: boolean;
  conectadoEn: string | null;
  dashboard: string | null;
};

export type DatosPagoCuota = {
  idCargo: number;
  idCuota: number;
  metodo: 'SPEI' | 'STRIPE';
  estado: 'PENDIENTE' | 'PAGADO' | 'EXPIRADO' | 'CANCELADO';
  montoTotal: number;
  moneda: string;
  clabe?: string | null;
  banco?: string | null;
  beneficiario?: string | null;
  referencia?: string | null;
  clientSecret?: string | null;
  permitirMsi?: boolean;
  motivo?: string | null;
};

/** Cargo SPEI pendiente de que el administrador lo concilie. */
export type CargoPendiente = {
  idCargo: number;
  idCuota: number;
  periodo: string;
  claveUnidad: string;
  montoTotal: number;
  referenciaSpei: string | null;
  expiraEn: string | null;
};

/** Estado de la cuota frente a su cargo, para el regreso del checkout. */
export type EstadoCargoCuota = {
  idCuota: number;
  estadoCuota: 'PENDIENTE' | 'PAGADA' | 'VENCIDA' | string;
  idCargo: number | null;
  estadoCargo: 'PENDIENTE' | 'PAGADO' | 'EXPIRADO' | 'CANCELADO' | null;
  pagadoEn: string | null;
};

export type ActualizarConfiguracionCobro = {
  metodo?: MetodoCobro;
  clabe?: string;
  banco?: string;
  beneficiario?: string;
  referenciaPrefijo?: string;
  permitirMsi?: boolean;
  comisionTasa?: number;
  comisionFijo?: number;
};

/**
 * Cliente del modulo de cobro de cuotas.
 *
 * El condomino usa `datosPagoCuota` / `crearCobroTarjeta`; el administrador usa
 * la configuracion y los endpoints de Connect.
 */
export const cobrosApi = {
  configuracion(idCondominio: number) {
    return apiRequest<ConfiguracionCobro>(`/cobros/configuracion?idCondominio=${idCondominio}`);
  },

  actualizarConfiguracion(idCondominio: number, cambios: ActualizarConfiguracionCobro) {
    return apiRequest<ConfiguracionCobro>(`/cobros/configuracion?idCondominio=${idCondominio}`, {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    });
  },

  /** Datos para pagar una cuota (SPEI o tarjeta, segun el metodo configurado). */
  datosPagoCuota(idCondominio: number, idCuota: number) {
    return apiRequest<DatosPagoCuota>(`/cobros/cuota/${idCuota}?idCondominio=${idCondominio}`);
  },

  /**
   * Crea el cobro con tarjeta y devuelve el `clientSecret` del checkout
   * embebido. El pago no se marca como hecho aqui: lo confirma el webhook.
   */
  crearCobroTarjeta(idCondominio: number, idCuota: number) {
    return apiRequest<DatosPagoCuota>('/cobros/cargo/tarjeta', {
      method: 'POST',
      body: JSON.stringify({ idCondominio, idCuota }),
    });
  },

  /** Administrador: concilia un cargo SPEI (el dinero ya llego a su cuenta). */
  confirmarCargoSpei(idCondominio: number, idCargo: number, referenciaBancaria?: string) {
    return apiRequest<{ idCargo: number; estado: string }>('/cobros/cargo/spei/confirmar', {
      method: 'PATCH',
      body: JSON.stringify({ idCondominio, idCargo, referenciaBancaria }),
    });
  },

  /** Administrador: cargos SPEI pendientes de conciliar. */
  cargosPendientes(idCondominio: number) {
    return apiRequest<CargoPendiente[]>(`/cobros/cargos/pendientes?idCondominio=${idCondominio}`);
  },

  /**
   * Estado de una cuota frente a su cargo. Se consulta al volver del checkout
   * de Stripe: la confirmacion llega por webhook y puede tardar unos segundos.
   */
  estadoCargoCuota(idCondominio: number, idCuota: number) {
    return apiRequest<EstadoCargoCuota>(
      `/cobros/cargo/estado?idCondominio=${idCondominio}&idCuota=${idCuota}`,
    );
  },

  estadoConnect(idCondominio: number) {
    return apiRequest<EstadoConnect>(`/cobros/connect/estado?idCondominio=${idCondominio}`);
  },

  crearCuentaConnect(idCondominio: number) {
    return apiRequest<EstadoConnect>(`/cobros/connect/cuenta?idCondominio=${idCondominio}`, {
      method: 'POST',
    });
  },

  /** Devuelve la URL de onboarding de Stripe a la que hay que redirigir. */
  crearEnlaceConnect(idCondominio: number) {
    return apiRequest<{ url: string }>(`/cobros/connect/enlace?idCondominio=${idCondominio}`, {
      method: 'POST',
    });
  },
};
