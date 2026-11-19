import { apiRequest } from './backendApi.service';

/** Metodo con el que se paga un cargo. */
export type MetodoCargo = 'SPEI' | 'STRIPE';

export type ConfiguracionCobro = {
  idCondominio: number;
  /** SPEI. `speiActivo` es la decision del admin; `puedeUsarSpei` el resultado. */
  speiActivo: boolean;
  puedeUsarSpei: boolean;
  clabe: string | null;
  banco: string | null;
  beneficiario: string | null;
  referenciaPrefijo: string | null;
  /** Stripe. Independiente de SPEI: los dos pueden estar activos. */
  stripeActivo: boolean;
  puedeUsarStripe: boolean;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripeConectadoEn: string | null;
  /** Metodos que el condomino puede elegir hoy. */
  metodosDisponibles: MetodoCargo[];
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

/** Administrador activo y su Person en la cuenta conectada. */
export type AdministradorStripe = {
  idUsuarioCondominio: number;
  nombre: string;
  correo: string;
  stripePersonId: string | null;
  /** Marcado como propietario de la cuenta en Stripe. */
  propietario: boolean;
  representante: boolean;
};

/** Persona de Stripe que ya no corresponde a un administrador activo. */
export type PersonaHuerfanaStripe = {
  stripePersonId: string;
  nombre: string;
  correo: string | null;
  motivo: 'inactivo' | 'condomino' | 'inexistente';
};

export type EstadoAdministradoresStripe = {
  tieneCuenta: boolean;
  stripeAccountId: string | null;
  administradores: AdministradorStripe[];
  huerfanos: PersonaHuerfanaStripe[];
  advertencias: string[];
};

export type OpcionesPagoCuota = {
  idCuota: number;
  /** Cuota base, sin recargos. */
  montoBase: number;
  /** Recargo devengado a hoy. 0 si el condominio no cobra recargos. */
  montoRecargo: number;
  /** Dias de atraso con los que se calculo el recargo. */
  diasAtraso: number;
  /** Lo que se cobra hoy: base + recargo. */
  montoTotal: number;
  moneda: string;
  /** Metodos que el condominio ofrece hoy. */
  metodosDisponibles: MetodoCargo[];
  /** Metodo del cargo vigente, si ya hay uno en proceso. */
  metodoEnProceso: MetodoCargo | null;
  idCargoEnProceso: number | null;
  /** Mensaje cuando no hay ningun metodo disponible. */
  motivo: string | null;
};

export type DatosPagoCuota = {
  idCargo: number;
  idCuota: number;
  metodo: MetodoCargo;
  estado: 'PENDIENTE' | 'PAGADO' | 'EXPIRADO' | 'CANCELADO';
  /** Cuota base, sin recargos. */
  montoBase?: number;
  /** Recargo incluido en este cobro. */
  montoRecargo?: number;
  /** Dias de atraso con los que se calculo el recargo. */
  diasAtraso?: number;
  /** Total a pagar: base + recargo. */
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
  /** Metodos que el condominio ofrece, para cambiar sin cerrar el modal. */
  metodosDisponibles?: MetodoCargo[];
  motivo?: string | null;
};

/** Cargo SPEI pendiente de que el administrador lo concilie. */
export type CargoPendiente = {
  idCargo: number;
  idCuota: number;
  periodo: string;
  claveUnidad: string;
  /** Base + recargo: lo que debe llegar por transferencia. */
  montoTotal: number;
  montoRecargo: number;
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
  /** Ofrecer transferencia SPEI (exige CLABE). */
  speiActivo?: boolean;
  /** Ofrecer pago con tarjeta (exige cuenta Connect y requisitos). */
  stripeActivo?: boolean;
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

  /**
   * Metodos de pago que ofrece el condominio.
   *
   * Disponible tambien para el condomino (a diferencia de `configuracion`, que
   * es solo del administrador). Lo usa la lista de cuotas para decidir si
   * muestra "Pagar en linea".
   */
  metodosPago(idCondominio: number) {
    return apiRequest<{ metodosDisponibles: MetodoCargo[] }>(
      `/cobros/metodos?idCondominio=${idCondominio}`,
    );
  },

  actualizarConfiguracion(idCondominio: number, cambios: ActualizarConfiguracionCobro) {
    return apiRequest<ConfiguracionCobro>(`/cobros/configuracion?idCondominio=${idCondominio}`, {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    });
  },

  /** Opciones de pago de una cuota. No crea cargos: solo dice que hay. */
  opcionesPagoCuota(idCondominio: number, idCuota: number) {
    return apiRequest<OpcionesPagoCuota>(
      `/cobros/cuota/${idCuota}?idCondominio=${idCondominio}`,
    );
  },

  /**
   * Crea el cargo del metodo elegido por el condomino.
   *
   * Reemplaza al antiguo "datos de pago" en el GET: con SPEI y tarjeta activos
   * a la vez, el cargo se crea hasta que el condomino elige.
   */
  crearCargo(idCondominio: number, idCuota: number, metodo: MetodoCargo) {
    return apiRequest<DatosPagoCuota>('/cobros/cargo', {
      method: 'POST',
      body: JSON.stringify({ idCondominio, idCuota, metodo }),
    });
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

  /** Administrador: quién está como propietario en la cuenta de Stripe. */
  administradoresStripe(idCondominio: number) {
    return apiRequest<EstadoAdministradoresStripe>(
      `/cobros/connect/administradores?idCondominio=${idCondominio}`,
    );
  },

  /** Administrador: crea o adopta la Person de cada administrador activo. */
  sincronizarAdministradoresStripe(idCondominio: number) {
    return apiRequest<EstadoAdministradoresStripe>(
      `/cobros/connect/administradores/sincronizar?idCondominio=${idCondominio}`,
      { method: 'POST' },
    );
  },

  /** Administrador: quita una Person de la cuenta (con confirmación previa). */
  quitarAdministradorStripe(idCondominio: number, idPersonaStripe: string) {
    return apiRequest<{ eliminado: boolean; motivo: string | null }>(
      `/cobros/connect/administradores/${encodeURIComponent(
        idPersonaStripe,
      )}?idCondominio=${idCondominio}`,
      { method: 'DELETE' },
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
