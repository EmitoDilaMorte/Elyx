/**
 * Contrato de un proveedor de cobro para la suscripcion a Elyx.
 *
 * Elyx NUNCA es el comercio del cobro de cuotas del condominio: eso es un flujo
 * distinto (cuentas conectadas + KYC del administrador). Este contrato es solo
 * para la suscripcion de la plataforma.
 *
 * Proveedores:
 *  - `MANUAL`: transferencia + confirmacion del superusuario.
 *  - `NULL`: no se cobra (self-hosting).
 *  - `STRIPE`: Checkout Sessions en modo suscripcion con UI embebida. Stripe
 *    Link aparece dentro del checkout sin integracion aparte (es una cartera,
 *    no una pasarela).
 */
import type { DesglosePrecio } from '../precio-suscripcion';

export type EstadoCobroProveedor = 'PENDIENTE' | 'PAGADO' | 'FALLIDO';

/**
 * Como debe presentarse el cobro en el frontend.
 *  - `MANUAL`: mostrar referencia e instrucciones (transferencia).
 *  - `EMBEDDED`: montar el checkout dentro de la pagina con `clientSecret`.
 *  - `REDIRECT`: abrir `urlCheckout` en el navegador.
 */
export type ModoCobro = 'MANUAL' | 'EMBEDDED' | 'REDIRECT';

export type CobroSuscripcion = {
  /** Referencia que el administrador debe citar al pagar. */
  referencia: string;
  /** Instrucciones legibles (banco, CLABE, monto...). */
  instrucciones: string;
  monto: number;
  moneda: string;
  /** URL de checkout hospedado, si el proveedor lo soporta. */
  urlCheckout: string | null;
  modo: ModoCobro;
  /**
   * Secreto del checkout embebido. Solo se entrega al administrador del
   * condominio; no permite cobrar a terceros.
   */
  clientSecret?: string | null;
  desglose?: DesglosePrecio | null;
};

export type DatosCobro = {
  idCondominio: number;
  /** ID interno de la suscripcion (va en la metadata de Stripe). */
  idSuscripcion?: number;
  nombreCondominio: string;
  correoAdmin: string;
  /** Monto NETO (sin IVA) que se guarda en la suscripcion. */
  monto: number;
  moneda: string;
  periodo: 'MENSUAL' | 'ANUAL';
  referenciaSugerida: string;
  /** Unidades contratadas: definen la cantidad del segundo `line_item`. */
  unidades?: number;
  /** Cliente ya creado en el proveedor, para no duplicarlo. */
  idClienteExterno?: string | null;
  /** Datos fiscales capturados (informativo; el CFDI se emite aparte). */
  datosFiscales?: {
    rfc: string | null;
    razonSocial: string | null;
    regimenFiscal: string | null;
    cpFiscal: string | null;
  } | null;
};

export interface SuscripcionProvider {
  readonly nombre: string;

  /** `false` cuando faltan credenciales y no se pueden crear cobros reales. */
  readonly disponible: boolean;

  crearCobro(datos: DatosCobro): Promise<CobroSuscripcion>;

  consultarEstado(referencia: string): Promise<EstadoCobroProveedor>;

  cancelar(referencia: string): Promise<void>;
}

export const SUSCRIPCION_PROVIDER = Symbol('SUSCRIPCION_PROVIDER');
