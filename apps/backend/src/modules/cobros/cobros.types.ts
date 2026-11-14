/** Tipos compartidos del modulo de cobro de cuotas. */

export type MetodoCobro = 'NINGUNO' | 'SPEI' | 'STRIPE_CONNECT';
export type MetodoCargo = 'SPEI' | 'STRIPE';
export type EstadoCargo = 'PENDIENTE' | 'PAGADO' | 'EXPIRADO' | 'CANCELADO';

/** Configuracion de cobro tal como la ve el administrador. */
export type ConfiguracionCobro = {
  idCondominio: number;
  metodo: MetodoCobro;
  /** SPEI */
  clabe: string | null;
  banco: string | null;
  beneficiario: string | null;
  referenciaPrefijo: string | null;
  /** Stripe Connect */
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripeConectadoEn: string | null;
  /** Interruptores */
  permitirMsi: boolean;
  comisionTasa: number;
  comisionFijo: number;
  activo: boolean;
  /**
   * Datos que se publican en `/condominio/:id`, la URL que Stripe revisa para
   * verificar el negocio. Se editan desde este mismo panel porque son requisito
   * del cobro con tarjeta, no del resto de la plataforma.
   */
  descripcionPublica: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
  /** `true` mientras `/condominio/:id` sea accesible. */
  paginaPublicaActiva: boolean;
  /** URL publica que se declara a Stripe como `business_url`. */
  urlPublica: string;
  /** Campos del RFC y de contacto que aun faltan para poder usar Connect. */
  requisitosConnectFaltantes: string[];
  /**
   * `false` cuando falta el RFC o los datos de contacto: sin ellos Stripe no
   * puede verificar la cuenta y no hay forma de depositarle. La UI deshabilita
   * la opcion ANTES de intentar.
   */
  puedeUsarConnect: boolean;
  /** Motivo legible cuando `puedeUsarConnect` es false. */
  motivoNoConnect: string | null;
  /** `true` si ya hay CLABE capturada, es decir, SPEI esta listo. */
  puedeUsarSpei: boolean;
};

/** Datos que el condomino necesita para pagar una cuota. */
export type DatosPagoCuota = {
  idCargo: number;
  idCuota: number;
  metodo: MetodoCargo;
  estado: EstadoCargo;
  /** Lo que paga el condomino: siempre igual al monto de la cuota. */
  montoTotal: number;
  moneda: string;
  /** Solo SPEI */
  clabe?: string | null;
  banco?: string | null;
  beneficiario?: string | null;
  referencia?: string | null;
  /** Solo Stripe */
  clientSecret?: string | null;
  /** `true` si el condominio permite meses sin intereses. */
  permitirMsi?: boolean;
  /**
   * `true` si el condomino ya tiene tarjetas guardadas de compras anteriores:
   * el formulario de Stripe las muestra al inicio.
   */
  tarjetaGuardada?: boolean;
  /**
   * `true` si esta compra puede guardar la tarjeta para las siguientes. Es
   * `on_session`: nunca se cobra sin que el condomino este presente.
   */
  guardarTarjeta?: boolean;
  /** Mensaje cuando el cobro no se puede iniciar. */
  motivo?: string | null;
};

export type CargoRecord = {
  idCargo: number;
  idCuota: number;
  idCondominio: number;
  metodo: MetodoCargo;
  estado: EstadoCargo;
  montoCuota: number;
  montoComision: number;
  montoTotal: number;
  moneda: string;
  referenciaSpei: string | null;
  expiraEn: string | null;
  pagadoEn: string | null;
};

/**
 * Cargo pendiente de conciliar, con los datos que el administrador reconoce
 * en su estado de cuenta bancario (unidad, periodo y referencia).
 */
export type CargoPendiente = {
  idCargo: number;
  idCuota: number;
  periodo: string;
  claveUnidad: string;
  montoTotal: number;
  referenciaSpei: string | null;
  expiraEn: string | null;
};

/** Estados del objeto Payout de Stripe, replicados en `depositos_condominio`. */
export type EstadoDeposito = 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';

/**
 * Deposito que Stripe hizo (o hara) a la cuenta bancaria del condominio.
 *
 * Con `dashboard: 'none'` el condominio no tiene donde consultarlos, asi que
 * se replican aqui desde los eventos `payout.*`.
 */
export type DepositoCondominio = {
  idDeposito: number;
  idCondominio: number;
  /** `po_...` de Stripe. */
  stripePayoutId: string;
  monto: number;
  moneda: string;
  estado: EstadoDeposito;
  /** `standard` o `instant`. */
  metodo: string | null;
  /** `bank_account` o `card`. */
  tipo: string | null;
  /** Fecha (YYYY-MM-DD) en que Stripe espera que llegue al banco. */
  llegaEn: string | null;
  creadoEn: string | null;
  actualizadoEn: string | null;
};
