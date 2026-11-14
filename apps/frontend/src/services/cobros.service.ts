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
  /** Datos de la pagina publica (requisito de Stripe para verificar el negocio). */
  descripcionPublica: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
  paginaPublicaActiva: boolean;
  /** URL que se declara a Stripe como `business_url`. */
  urlPublica: string;
  /** Campos que faltan para poder usar Connect: `rfc`, `descripcionPublica`, etc. */
  requisitosConnectFaltantes: string[];
  /** `false` si falta algun requisito: la UI deshabilita Connect antes de intentar. */
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
  /** `true` si ya hay tarjetas guardadas de compras anteriores. */
  tarjetaGuardada?: boolean;
  /** `true` si esta compra puede guardar la tarjeta (siempre `on_session`). */
  guardarTarjeta?: boolean;
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

/** Estados del deposito (Payout de Stripe). */
export type EstadoDeposito = 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';

/**
 * Deposito que Stripe hizo al condominio.
 *
 * Con `dashboard: 'none'` el condominio no tiene panel de Stripe: esta lista es
 * la unica forma de ver cuanto y cuando le depositaron.
 */
export type Deposito = {
  idDeposito: number;
  idCondominio: number;
  stripePayoutId: string;
  monto: number;
  moneda: string;
  estado: EstadoDeposito;
  metodo: string | null;
  tipo: string | null;
  /** Fecha (YYYY-MM-DD) en que se espera que llegue al banco. */
  llegaEn: string | null;
  creadoEn: string | null;
  actualizadoEn: string | null;
};

/** Resultado de forzar la conciliacion de depositos contra Stripe. */
export type ResultadoReconciliacion = {
  revisados: number;
  creados: number;
  actualizados: number;
  error?: string;
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
  descripcionPublica?: string;
  correoContacto?: string;
  telefonoContacto?: string;
  paginaPublicaActiva?: boolean;
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

  /**
   * URL de onboarding hospedado por Stripe.
   *
   * **Respaldo.** El camino principal es `crearSesionConnect`, que monta el
   * formulario dentro de Elyx. Este enlace se conserva para cuando el componente
   * embebido no pueda cargarse.
   */
  crearEnlaceConnect(idCondominio: number) {
    return apiRequest<{ url: string }>(`/cobros/connect/enlace?idCondominio=${idCondominio}`, {
      method: 'POST',
    });
  },

  /**
   * Crea la sesión para montar el onboarding **dentro de Elyx**.
   *
   * Devuelve el `clientSecret` que consume `@stripe/connect-js`. Se puede volver
   * a llamar cuando Stripe pide renovar la sesión.
   */
  crearSesionConnect(idCondominio: number) {
    return apiRequest<{ clientSecret: string }>(
      `/cobros/connect/sesion?idCondominio=${idCondominio}`,
      { method: 'POST' },
    );
  },

  /** Administrador: depositos que Stripe hizo al condominio. */
  depositos(idCondominio: number) {
    return apiRequest<Deposito[]>(`/cobros/depositos?idCondominio=${idCondominio}`);
  },

  /**
   * Administrador: fuerza la reconciliacion contra Stripe.
   *
   * Util cuando el webhook no tiene los eventos `payout.*` configurados o
   * cuando el deposito ya aparecio en el banco y se quiere ver de inmediato.
   */
  reconciliarDepositos(idCondominio: number) {
    return apiRequest<ResultadoReconciliacion>(
      `/cobros/depositos/reconciliar?idCondominio=${idCondominio}`,
      { method: 'POST' },
    );
  },
};
