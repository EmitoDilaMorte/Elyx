import type Stripe from 'stripe';

/**
 * Lectura de campos de Stripe que cambiaron de sitio entre versiones de la API.
 *
 * **Por que existe este archivo**: el SDK instalado (`stripe-node` 23.x) usa la
 * version de API con la que se publico, pero los webhooks se renderizan con la
 * version configurada en el *event destination* del Dashboard. Si esa version es
 * mas nueva que la del SDK, los objetos que llegan por webhook tienen la forma
 * nueva y los campos de la forma vieja llegan `undefined`.
 *
 * Eso ya rompio el flujo una vez: `invoice.paid` respondia 200 y no hacia nada
 * porque `invoice.subscription` ya no existe en la API actual, y el periodo de
 * la suscripcion se perdia porque `current_period_end` se movio a cada item.
 * Como no habia log, el sintoma era "el pago se cobro pero Elyx sigue en
 * pendiente". Centralizar la lectura aqui evita repetir el diagnostico.
 *
 * Regla: siempre se leen **primero** las dos formas (nueva y heredada). Nunca
 * asumir una sola, ni siquiera cuando el SDK solo declare una.
 */

/**
 * Suscripcion a la que pertenece una factura.
 *
 * - API actual (`2025-03-31` "basil" y posteriores):
 *   `invoice.parent.subscription_details.subscription`.
 * - Forma heredada: `invoice.subscription` en la raiz.
 */
export function idSuscripcionDeFactura(factura: Stripe.Invoice): string | null {
  // Forma heredada. Se mantiene porque un endpoint configurado con una version
  // anterior sigue enviando el campo en la raiz.
  const heredado = (
    factura as unknown as { subscription?: string | { id: string } | null }
  ).subscription;
  if (heredado) {
    return typeof heredado === 'string' ? heredado : heredado.id;
  }

  // Forma actual.
  const padre = (
    factura as unknown as {
      parent?: {
        subscription_details?: {
          subscription?: string | { id: string } | null;
        } | null;
      } | null;
    }
  ).parent;

  const actual = padre?.subscription_details?.subscription;
  if (!actual) {
    return null;
  }
  return typeof actual === 'string' ? actual : actual.id;
}

/**
 * Periodo facturado de la suscripcion.
 *
 * - Forma actual: cada item trae su propio `current_period_start/end`.
 * - Forma heredada: ambos campos estaban en la raiz de la suscripcion.
 *
 * Se toma el primer item (la cuota base) porque todos los items de una misma
 * suscripcion comparten periodo; si algun dia no fuera asi, el periodo que
 * interesa para `suscripciones_condominio.fecha_fin` sigue siendo el de la base.
 */
export function periodoDeSuscripcion(suscripcion: Stripe.Subscription): {
  inicio: string | null;
  fin: string | null;
} {
  const raiz = suscripcion as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };

  const item = suscripcion.items?.data?.[0] as unknown as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;

  return {
    inicio: fechaDesdeUnix(raiz.current_period_start ?? item?.current_period_start),
    fin: fechaDesdeUnix(raiz.current_period_end ?? item?.current_period_end),
  };
}

/**
 * Periodo **de servicio** que cubre una factura.
 *
 * **No se usa `invoice.period_start/period_end`**: en la primera factura de una
 * suscripcion creada por Checkout, Stripe reporta ambos campos con el mismo
 * instante de creacion. Guardar ese valor en `suscripciones_condominio.fecha_fin`
 * hacia que el cron `suspenderVencidas` (3 AM) marcara VENCIDA una suscripcion
 * recien pagada.
 *
 * El periodo real vive en cada linea de la factura (`lines.data[].period`). Se
 * toma el inicio mas temprano y el fin mas tardio para cubrir facturas con
 * prorrateos.
 */
export function periodoDeFactura(factura: Stripe.Invoice): {
  inicio: string | null;
  fin: string | null;
} {
  const lineas = factura.lines?.data ?? [];

  let inicioSeg = Number.POSITIVE_INFINITY;
  let finSeg = 0;

  for (const linea of lineas) {
    const periodo = (linea as unknown as {
      period?: { start?: number; end?: number } | null;
    }).period;

    if (Number.isFinite(periodo?.start) && (periodo?.start ?? 0) > 0) {
      inicioSeg = Math.min(inicioSeg, periodo!.start!);
    }
    if (Number.isFinite(periodo?.end) && (periodo?.end ?? 0) > 0) {
      finSeg = Math.max(finSeg, periodo!.end!);
    }
  }

  // Respaldo: si la factura no trae lineas (evento recortado), se usa el
  // periodo propio de la factura. Es peor dato, pero nunca queda vacio.
  const inicio = Number.isFinite(inicioSeg)
    ? fechaDesdeUnix(inicioSeg)
    : fechaDesdeUnix(factura.period_start);
  const fin = finSeg > 0 ? fechaDesdeUnix(finSeg) : fechaDesdeUnix(factura.period_end);

  return { inicio, fin };
}

/** Segundos epoch a ISO. Devuelve `null` si el valor no vino. */
export function fechaDesdeUnix(segundos: number | null | undefined): string | null {
  if (!segundos || !Number.isFinite(segundos)) {
    return null;
  }
  return new Date(segundos * 1000).toISOString();
}
