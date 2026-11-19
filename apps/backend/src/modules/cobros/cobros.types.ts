/** Tipos compartidos del modulo de cobro de cuotas. */

export type MetodoCargo = 'SPEI' | 'STRIPE';
export type EstadoCargo = 'PENDIENTE' | 'PAGADO' | 'EXPIRADO' | 'CANCELADO';

/** Configuracion de cobro tal como la ve el administrador. */
export type ConfiguracionCobro = {
  idCondominio: number;
  /** SPEI. `speiActivo` es la decision del admin; `puedeUsarSpei` el resultado. */
  speiActivo: boolean;
  puedeUsarSpei: boolean;
  clabe: string | null;
  banco: string | null;
  beneficiario: string | null;
  referenciaPrefijo: string | null;
  /** Stripe Connect. Independiente de SPEI: pueden estar los dos activos. */
  stripeActivo: boolean;
  puedeUsarStripe: boolean;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripeConectadoEn: string | null;
  /** Metodos que el condomino puede elegir hoy, en orden de presentacion. */
  metodosDisponibles: MetodoCargo[];
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
};

/**
 * Opciones de pago de una cuota. Es de SOLO LECTURA: no crea cargos.
 *
 * El cargo se crea cuando el condomino elige un metodo, porque con dos metodos
 * activos crear el de uno al abrir el modal bloquearia el otro (el indice
 * unico parcial permite un solo cargo PENDIENTE por cuota).
 */
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
  metodosDisponibles: MetodoCargo[];
  /** Metodo del cargo vigente, si ya hay uno en proceso. */
  metodoEnProceso: MetodoCargo | null;
  idCargoEnProceso: number | null;
  /** Mensaje cuando no hay ningun metodo disponible. */
  motivo: string | null;
};

/** Datos que el condomino necesita para pagar una cuota. */
export type DatosPagoCuota = {
  idCargo: number;
  idCuota: number;
  metodo: MetodoCargo;
  estado: EstadoCargo;
  /** Cuota base, sin recargos. */
  montoBase: number;
  /** Recargo incluido en este cobro. */
  montoRecargo: number;
  /**
   * Dias de atraso con los que se calculo el recargo. Opcional: el cargo ya
   * guardado no los conserva, solo el importe congelado.
   */
  diasAtraso?: number;
  /** Lo que se cobra: base + recargo. */
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
  /** Metodos que el condominio ofrece, para cambiar sin cerrar el modal. */
  metodosDisponibles?: MetodoCargo[];
  /** Mensaje cuando el cobro no se puede iniciar. */
  motivo?: string | null;
};

export type CargoRecord = {
  idCargo: number;
  idCuota: number;
  idCondominio: number;
  metodo: MetodoCargo;
  estado: EstadoCargo;
  /** Cuota base del cargo. */
  montoCuota: number;
  /** Recargo incluido en el cargo (0 si no aplica). */
  montoRecargo: number;
  montoComision: number;
  /** montoCuota + montoRecargo. */
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
  /** Base + recargo: lo que debe llegar por transferencia. */
  montoTotal: number;
  montoRecargo: number;
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
