/**
 * Contrato del reporte financiero detallado (`GET /reportes-financieros/resumen`).
 *
 * Refleja `reportes-financieros.types.ts` del backend. Se mantiene aparte de
 * `types/app.ts` porque el panel consume el resumen completo y no las filas
 * simples de `AppData`.
 */

export type RolReporte = 'ADMINISTRADOR' | 'CONDOMINO';

export type InfoCondominioReporte = {
  nombre: string;
  direccion: string | null;
  rfc: string | null;
  razonSocial: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
};

export type KpisReporte = {
  periodos: number;
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
  unidadesActivas: number;
  unidadesConAdeudo: number;
  cuotasPendientes: number;
};

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

export type CategoriaGastoReporte = {
  categoria: string;
  monto: number;
  movimientos: number;
  porcentaje: number;
};

export type OrigenPagoReporte = 'COMPROBANTE' | 'SPEI' | 'STRIPE';

export type MetodoPagoReporte = {
  origen: OrigenPagoReporte;
  monto: number;
  recargos: number;
  pagos: number;
  porcentaje: number;
};

export type BucketAntiguedad =
  | 'POR_VENCER'
  | 'D_1_30'
  | 'D_31_60'
  | 'D_61_90'
  | 'MAS_90';

export type AntiguedadReporte = {
  bucket: BucketAntiguedad;
  etiqueta: string;
  cuotas: number;
  capital: number;
  recargos: number;
};

export type EstadoCobranzaUnidad = 'AL_CORRIENTE' | 'PENDIENTE' | 'VENCIDO';

export type CobranzaUnidadReporte = {
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

export type MiUnidadReporte = {
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

export type MovimientoPagoReporte = {
  idPago: number;
  periodo: string;
  tipo: string;
  claveUnidad: string | null;
  monto: number;
  montoRecargo: number;
  fechaPago: string;
  estado: 'CAPTURADO' | 'VALIDADO' | 'RECHAZADO';
  origen: OrigenPagoReporte;
  referencia: string | null;
};

export type MovimientoGastoReporte = {
  idGasto: number;
  concepto: string;
  categoria: string;
  monto: number;
  fecha: string;
  proveedor: string | null;
};

export type ReporteFinancieroResumen = {
  idCondominio: number;
  condominio: InfoCondominioReporte;
  rol: RolReporte;
  generadoEn: string;
  periodos: string[];
  periodosDisponibles: string[];
  kpis: KpisReporte;
  seriePeriodos: PeriodoFinanciero[];
  gastosPorCategoria: CategoriaGastoReporte[];
  metodosPago: MetodoPagoReporte[];
  antiguedadAdeudos: AntiguedadReporte[];
  /** Primero las unidades con adeudo, en orden natural de unidad. */
  cobranzaPorUnidad?: CobranzaUnidadReporte[];
  /**
   * Las 10 unidades con mayor adeudo. Se eligen por monto pero llegan en orden
   * natural de unidad, para poder localizarlas en la lista.
   */
  topDeudores?: CobranzaUnidadReporte[];
  miUnidad?: MiUnidadReporte | null;
  movimientos: {
    pagos: MovimientoPagoReporte[];
    gastos: MovimientoGastoReporte[];
  };
};
