/** Contrato del recibo de pago y su detalle imprimible. */

export type OrigenRecibo = 'COMPROBANTE' | 'SPEI' | 'STRIPE';

/** Fila de `GET /recibos`: solo el folio y su ubicacion. */
export type ReciboRecord = {
  idRecibo: number;
  idPago: number;
  idCondominio: number;
  folio: string;
  fechaGeneracion: string;
  urlPdf: string;
};

export type ReciboCondominio = {
  nombre: string;
  direccion: string | null;
  rfc: string | null;
  razonSocial: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
};

export type ReciboUnidad = {
  idUnidad: number;
  claveUnidad: string;
  tipoUnidad: string;
};

export type ReciboCondomino = {
  nombre: string;
  correo: string | null;
};

export type ReciboCuota = {
  idCuota: number;
  periodo: string;
  tipo: string;
  montoBase: number;
  fechaLimite: string;
  /** Tasa diaria vigente al generar. 0 si el condominio no cobra recargos. */
  recargoPorDia: number;
};

export type ReciboPago = {
  idPago: number;
  fechaPago: string;
  estado: string;
  origen: OrigenRecibo;
  /** Etiqueta legible del medio de pago. */
  metodoPago: string;
  referencia: string | null;
  /** Total pagado: capital + recargo. */
  monto: number;
  /** Recargo por atraso incluido en el pago. */
  montoRecargo: number;
  /** Capital de la cuota cubierto por el pago. */
  montoCapital: number;
  /**
   * Diferencia entre lo pagado y (capital + recargo).
   *
   * Solo aparece en pagos historicos capturados antes de que existiera el
   * desglose de recargos: se muestra como "Ajuste" para que el recibo cuadre
   * con el monto real sin inventar un concepto.
   */
  ajuste: number;
};

export type ReciboCargo = {
  idCargo: number;
  metodo: string;
  referenciaSpei: string | null;
  paymentIntentId: string | null;
  pagadoEn: string | null;
};

export type ReciboDetalle = {
  folio: string;
  fechaGeneracion: string;
  condominio: ReciboCondominio;
  unidad: ReciboUnidad | null;
  condomino: ReciboCondomino | null;
  cuota: ReciboCuota;
  pago: ReciboPago;
  cargo: ReciboCargo | null;
};

export type ReciboGenerado = {
  idRecibo: number;
  idPago: number;
  idCondominio: number;
  folio: string;
  fechaGeneracion: string;
  urlPdf: string;
  /** Datos para dibujar el PDF en el navegador. */
  detalle: ReciboDetalle;
};
