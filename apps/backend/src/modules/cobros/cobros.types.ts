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
   * `false` cuando falta el RFC: sin el, Stripe no puede verificar la cuenta y
   * no hay forma de depositarle. La UI deshabilita la opcion ANTES de intentar.
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
