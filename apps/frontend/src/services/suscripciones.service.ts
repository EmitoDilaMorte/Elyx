import { apiRequest } from './backendApi.service';

export type Suscripcion = {
  idSuscripcion: number;
  idCondominio: number;
  nombreCondominio: string;
  estadoCondominio: string;
  plan: string;
  cupoUnidades: number | null;
  periodo: 'MENSUAL' | 'ANUAL';
  monto: number;
  moneda: string;
  estado: 'PENDIENTE' | 'ACTIVA' | 'VENCIDA' | 'CANCELADA';
  proveedor: string;
  referenciaPago: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  renovacionAutomatica: boolean;
  totalPagado: number;
  instructivo: string | null;
};

export type PagoSuscripcion = {
  idPagoSuscripcion: number;
  referencia: string | null;
  monto: number;
  moneda: string;
  estado: 'PENDIENTE' | 'PAGADO' | 'FALLIDO' | 'REEMBOLSADO';
  metodo: 'MANUAL' | 'TRANSFERENCIA' | 'CHECKOUT';
  periodoInicio: string | null;
  periodoFin: string | null;
  fecha: string;
  confirmadoPor: string | null;
};

/** Desglose del precio: todo NETO salvo `iva`/`total`. */
export type DesgloseSuscripcion = {
  precioBase: number;
  precioUnidad: number;
  unidades: number;
  neto: number;
  ivaPorcentaje: number;
  iva: number;
  total: number;
  moneda: string;
  /** El piso mensual elevo el neto por encima de base + unidades. */
  aplicoPiso: boolean;
};

export type ModoCobro = 'MANUAL' | 'EMBEDDED' | 'REDIRECT';

export type CobroSuscripcion = {
  referencia: string;
  instrucciones: string;
  monto: number;
  moneda: string;
  urlCheckout: string | null;
  modo: ModoCobro;
  /** Secreto del checkout embebido; solo lo recibe el administrador. */
  clientSecret?: string | null;
  desglose?: DesgloseSuscripcion | null;
};

export type DatosFiscales = {
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscal: string | null;
  cpFiscal: string | null;
  correoFacturacion: string | null;
  completo: boolean;
};

export const suscripcionesApi = {
  mia(idCondominio: number) {
    return apiRequest<Suscripcion | null>(`/suscripciones/mia?idCondominio=${idCondominio}`);
  },

  crearCobro(idCondominio: number) {
    return apiRequest<CobroSuscripcion>(`/suscripciones/mia/cobro?idCondominio=${idCondominio}`, {
      method: 'POST',
    });
  },

  /** Portal de cliente de Stripe (tarjeta, facturas, cancelar). */
  portal(idCondominio: number) {
    return apiRequest<{ url: string }>(`/suscripciones/mia/portal?idCondominio=${idCondominio}`, {
      method: 'POST',
    });
  },

  datosFiscales(idCondominio: number) {
    return apiRequest<DatosFiscales>(`/suscripciones/mia/datos-fiscales?idCondominio=${idCondominio}`);
  },

  actualizarDatosFiscales(
    idCondominio: number,
    payload: {
      rfc?: string;
      razonSocial?: string;
      regimenFiscal?: string;
      cpFiscal?: string;
      correoFacturacion?: string;
    },
  ) {
    return apiRequest<DatosFiscales>(`/suscripciones/mia/datos-fiscales?idCondominio=${idCondominio}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /** Ajusta la cantidad facturada en Stripe con prorrateo. */
  sincronizarUnidades(idCondominio: number, unidades: number) {
    return apiRequest<{ sincronizado: boolean; motivo?: string }>(
      `/suscripciones/mia/unidades?idCondominio=${idCondominio}`,
      { method: 'PATCH', body: JSON.stringify({ unidades }) },
    );
  },

  listar() {
    return apiRequest<Suscripcion[]>('/suscripciones');
  },

  pagos(idSuscripcion: number) {
    return apiRequest<PagoSuscripcion[]>(`/suscripciones/${idSuscripcion}/pagos`);
  },

  confirmarPago(
    idSuscripcion: number,
    payload: { referencia?: string; metodo?: 'MANUAL' | 'TRANSFERENCIA' | 'CHECKOUT'; nota?: string },
  ) {
    return apiRequest<Suscripcion>(`/suscripciones/${idSuscripcion}/confirmar-pago`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  cambiarEstado(idSuscripcion: number, estado: 'ACTIVA' | 'PENDIENTE' | 'VENCIDA' | 'CANCELADA') {
    return apiRequest<Suscripcion>(`/suscripciones/${idSuscripcion}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    });
  },
};
