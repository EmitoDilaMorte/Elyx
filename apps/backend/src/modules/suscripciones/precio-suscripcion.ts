/**
 * Precio de la suscripcion a Elyx: cuota base + costo por unidad, con piso.
 *
 * Todo es NETO (sin IVA). El IVA se desglosa aparte y NO es ingreso de Elyx.
 * Centralizarlo aqui evita que el backend y el frontend calculen distinto.
 */

export type ParametrosPrecio = {
  precioBase: number;
  precioUnidad: number;
  piso: number;
  ivaPorcentaje: number;
  moneda: string;
};

export type DesglosePrecio = {
  precioBase: number;
  precioUnidad: number;
  unidades: number;
  neto: number;
  ivaPorcentaje: number;
  iva: number;
  total: number;
  moneda: string;
  /** true si el piso mensual elevo el neto por encima de base + unidades. */
  aplicoPiso: boolean;
};

function numero(valor: string | undefined, porDefecto: number): number {
  const parsed = Number(valor);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : porDefecto;
}

export function leerParametrosPrecio(): ParametrosPrecio {
  return {
    precioBase: numero(process.env.SUSCRIPCION_PRECIO_BASE, 200),
    precioUnidad: numero(process.env.SUSCRIPCION_PRECIO_UNIDAD, 7),
    piso: numero(process.env.SUSCRIPCION_PRECIO_PISO, 250),
    ivaPorcentaje: numero(process.env.SUSCRIPCION_IVA_PORCENTAJE, 16),
    moneda: (process.env.SUSCRIPCION_MONEDA ?? 'MXN').trim().toUpperCase() || 'MXN',
  };
}

/** Redondeo a centavos: evita 410.00000001 en los importes de Stripe. */
function aCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Calcula el desglose neto + IVA para un numero de unidades.
 *
 * El piso aplica sobre el NETO (no sobre el total): con 3 unidades,
 * 200 + 21 = 221 sube a 250 netos; el IVA se calcula despues.
 */
export function calcularDesglose(
  unidades: number,
  parametros: ParametrosPrecio = leerParametrosPrecio(),
): DesglosePrecio {
  const cantidad = Number.isInteger(unidades) && unidades > 0 ? unidades : 1;

  const bruto = aCentavos(parametros.precioBase + parametros.precioUnidad * cantidad);
  const aplicoPiso = bruto < parametros.piso;
  const neto = aCentavos(aplicoPiso ? parametros.piso : bruto);
  const iva = aCentavos((neto * parametros.ivaPorcentaje) / 100);

  return {
    precioBase: parametros.precioBase,
    precioUnidad: parametros.precioUnidad,
    unidades: cantidad,
    neto,
    ivaPorcentaje: parametros.ivaPorcentaje,
    iva,
    total: aCentavos(neto + iva),
    moneda: parametros.moneda,
    aplicoPiso,
  };
}

/**
 * Importe que falta para llegar al piso mensual.
 *
 * `neto = max(piso, base + unidad x unidades)`. Ese `max` no se puede expresar
 * con dos lineas de cobro: cuando el piso aplica, esta diferencia se agrega
 * como una tercera linea de ajuste. Sin ella la pasarela cobra
 * `base + unidades` y el total no coincide con el guardado en la suscripcion.
 *
 * Se opera en centavos enteros para no arrastrar errores de coma flotante.
 */
export function ajustePiso(desglose: DesglosePrecio): number {
  const fijo =
    Math.round(desglose.precioBase * 100) +
    Math.round(desglose.precioUnidad * 100) * desglose.unidades;
  const neto = Math.round(desglose.neto * 100);

  // Nunca negativo: si el piso no aplica no hay nada que ajustar.
  return Math.max(neto - fijo, 0) / 100;
}
