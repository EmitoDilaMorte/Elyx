/** Recibo tal como lo devuelve el backend. */

export type OrigenRecibo = 'COMPROBANTE' | 'SPEI' | 'STRIPE';

export type ReciboCondominio = {
  nombre: string;
  direccion: string | null;
  rfc: string | null;
  razonSocial: string | null;
  correoContacto: string | null;
  telefonoContacto: string | null;
};

export type ReciboDetalle = {
  folio: string;
  fechaGeneracion: string;
  condominio: ReciboCondominio;
  unidad: { idUnidad: number; claveUnidad: string; tipoUnidad: string } | null;
  condomino: { nombre: string; correo: string | null } | null;
  cuota: {
    idCuota: number;
    periodo: string;
    tipo: string;
    montoBase: number;
    fechaLimite: string;
    recargoPorDia: number;
  };
  pago: {
    idPago: number;
    fechaPago: string;
    estado: string;
    origen: OrigenRecibo;
    metodoPago: string;
    referencia: string | null;
    monto: number;
    montoRecargo: number;
    montoCapital: number;
    ajuste: number;
  };
  cargo: {
    idCargo: number;
    metodo: string;
    referenciaSpei: string | null;
    paymentIntentId: string | null;
    pagadoEn: string | null;
  } | null;
};

export type ReciboGenerado = {
  idRecibo: number;
  idPago: number;
  idCondominio: number;
  folio: string;
  fechaGeneracion: string;
  urlPdf: string;
  detalle: ReciboDetalle;
};
