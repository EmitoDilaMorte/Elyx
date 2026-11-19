/**
 * Contrato del reporte financiero detallado.
 *
 * A diferencia de `GET /reportes-financieros` (una fila por periodo, pensada
 * para el polling y el calculo de comisiones), este resumen agrega KPIs,
 * series, desgloses y movimientos en UNA respuesta para que el panel no tenga
 * que hacer cinco peticiones ni recalcular dinero en el navegador.
 *
 * **Privacidad**: el condomino recibe `miUnidad` y los agregados, pero nunca
 * `cobranzaPorUnidad`, `topDeudores` ni pagos de otras unidades. Las
 * comisiones de Stripe son solo del administrador.
 */

/** Rol efectivo con el que se consulta el reporte. */
export type RolReporte = 'ADMINISTRADOR' | 'CONDOMINO';

export type InfoCondominio = {
  nombre: string;
  direccion: string | null;
  rfc: string | null;
  razonSocial: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
};

/** Totales del conjunto de periodos seleccionados. */
export type KpisReporte = {
  /** Cantidad de periodos con movimientos incluidos. */
  periodos: number;
  /** Cuotas emitidas (capital) de los periodos. */
  facturado: number;
  /** Capital efectivamente cobrado (sin recargos). */
  cobradoCapital: number;
  /** Recargos por atraso cobrados. */
  recargosCobrados: number;
  /** cobradoCapital + recargosCobrados. */
  ingresosTotales: number;
  gastos: number;
  /** Comision real de Stripe. Siempre 0 para el condomino. */
  comisiones: number;
  /** ingresosTotales - gastos - comisiones. */
  balanceNeto: number;
  /** Capital de cuotas sin pagar. */
  adeudoCapital: number;
  /** Recargo devengado de cuotas sin pagar. */
  recargosEstimados: number;
  /** adeudoCapital + recargosEstimados. */
  adeudoTotal: number;
  /** cobradoCapital / facturado, entre 0 y 1. */
  tasaCobranza: number;
  unidadesActivas: number;
  /** Unidades con al menos una cuota pendiente en el rango. */
  unidadesConAdeudo: number;
  cuotasPendientes: number;
};

/** Una fila de la serie por periodo (descendente por periodo). */
export type PeriodoFinanciero = {
  periodo: string;
  facturado: number;
  cobradoCapital: number;
  recargosCobrados: number;
  ingresosTotales: number;
  gastos: number;
  comisiones: number;
  balanceNeto: number;
  adeudoCapital: number;
  recargosEstimados: number;
  adeudoTotal: number;
  tasaCobranza: number;
  cuotas: number;
  cuotasPagadas: number;
  cuotasPendientes: number;
  pagosValidados: number;
  gastosRegistrados: number;
};

export type CategoriaGasto = {
  categoria: string;
  monto: number;
  movimientos: number;
  /** Porcentaje del gasto total del rango (0-100). */
  porcentaje: number;
};

export type MetodoPagoResumen = {
  origen: 'COMPROBANTE' | 'SPEI' | 'STRIPE';
  monto: number;
  recargos: number;
  pagos: number;
  /** Porcentaje del monto total cobrado (0-100). */
  porcentaje: number;
};

export type BucketAntiguedad =
  | 'POR_VENCER'
  | 'D_1_30'
  | 'D_31_60'
  | 'D_61_90'
  | 'MAS_90';

export type AntiguedadAdeudo = {
  bucket: BucketAntiguedad;
  etiqueta: string;
  cuotas: number;
  capital: number;
  recargos: number;
};

export type EstadoCobranzaUnidad = 'AL_CORRIENTE' | 'PENDIENTE' | 'VENCIDO';

/** Cobranza agregada por unidad. Solo se entrega al administrador. */
export type CobranzaUnidad = {
  idUnidad: number;
  claveUnidad: string;
  tipoUnidad: string;
  ocupante: string | null;
  facturado: number;
  cobradoCapital: number;
  recargosCobrados: number;
  adeudoCapital: number;
  recargosEstimados: number;
  adeudoTotal: number;
  cuotas: number;
  cuotasPendientes: number;
  diasAtrasoMax: number;
  estado: EstadoCobranzaUnidad;
};

/** Resumen de las unidades del condomino autenticado. */
export type MiUnidadResumen = {
  clavesUnidad: string[];
  facturado: number;
  cobradoCapital: number;
  recargosCobrados: number;
  adeudoCapital: number;
  recargosEstimados: number;
  adeudoTotal: number;
  cuotas: number;
  cuotasPendientes: number;
  diasAtrasoMax: number;
  estado: EstadoCobranzaUnidad;
};

export type MovimientoPago = {
  idPago: number;
  periodo: string;
  tipo: string;
  claveUnidad: string | null;
  monto: number;
  montoRecargo: number;
  fechaPago: string;
  estado: 'CAPTURADO' | 'VALIDADO' | 'RECHAZADO';
  origen: 'COMPROBANTE' | 'SPEI' | 'STRIPE';
  referencia: string | null;
};

export type MovimientoGasto = {
  idGasto: number;
  concepto: string;
  categoria: string;
  monto: number;
  fecha: string;
  proveedor: string | null;
};

export type ReporteFinancieroResumen = {
  idCondominio: number;
  condominio: InfoCondominio;
  rol: RolReporte;
  generadoEn: string;
  /** Periodos incluidos en la respuesta (descendente). */
  periodos: string[];
  /** Todos los periodos con informacion, para el selector. */
  periodosDisponibles: string[];
  kpis: KpisReporte;
  seriePeriodos: PeriodoFinanciero[];
  gastosPorCategoria: CategoriaGasto[];
  metodosPago: MetodoPagoResumen[];
  antiguedadAdeudos: AntiguedadAdeudo[];
  /** Solo administrador. Primero las unidades con adeudo, en orden natural. */
  cobranzaPorUnidad?: CobranzaUnidad[];
  /**
   * Solo administrador: las 10 unidades con mayor adeudo. Se eligen por monto
   * pero se devuelven en orden natural de unidad para poder localizarlas.
   */
  topDeudores?: CobranzaUnidad[];
  /** Solo condomino (o admin residente sin permiso de cartera). */
  miUnidad?: MiUnidadResumen | null;
  /**
   * Movimientos del rango. El condomino solo ve SUS pagos; los gastos son
   * agregados del condominio porque ya se muestran en su reporte.
   */
  movimientos: {
    pagos: MovimientoPago[];
    gastos: MovimientoGasto[];
  };
};

export type OpcionesResumenReporte = {
  periodos: string[] | null;
  rol: RolReporte;
  idUsuarioCondominio: number | null;
};
