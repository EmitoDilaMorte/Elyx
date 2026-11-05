export type EstadoSuscripcion = 'PENDIENTE' | 'ACTIVA' | 'VENCIDA' | 'CANCELADA';

export type SuscripcionRecord = {
  idSuscripcion: number;
  idCondominio: number;
  nombreCondominio: string;
  estadoCondominio: string;
  plan: string;
  cupoUnidades: number | null;
  periodo: 'MENSUAL' | 'ANUAL';
  monto: number;
  moneda: string;
  estado: EstadoSuscripcion;
  proveedor: string;
  referenciaPago: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  renovacionAutomatica: boolean;
  totalPagado: number;
  instructivo: string | null;
};

export type PagoSuscripcionRecord = {
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
