/**
 * Calculo del recargo por atraso de una cuota.
 *
 * `cuotas.recargo_por_dia` es una TASA diaria, no el acumulado. El recargo
 * devengado es `tasa * dias_de_atraso`. Este helper existe para que el cobro
 * manual, SPEI, tarjeta y los reportes usen EXACTAMENTE la misma formula que
 * `GET /estado-cuenta`; si cada camino redondeara por su cuenta, el saldo que
 * ve el condomino no cuadraria con lo que se le cobra.
 *
 * **Solo aplica a los condominios que configuran recargo.** Con
 * `recargoPorDia = 0` el resultado es 0 y el condomino paga la cuota base.
 * No hay un interruptor aparte: la tasa es la configuracion.
 */

export type RecargoCuota = {
  /** Dias transcurridos desde la fecha limite. 0 si aun no vence. */
  diasAtraso: number;
  /** Tasa diaria configurada en la cuota. */
  tasaDiaria: number;
  /** Recargo devengado, redondeado a centavos. */
  montoRecargo: number;
  /** Cuota base + recargo: lo que hay que pagar hoy. */
  montoTotal: number;
};

/** Redondeo a centavos: evita 1834.9999999 en importes de dinero. */
export function aCentavos(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
}

/**
 * Normaliza una fecha a `YYYY-MM-DD` sin desplazarla por zona horaria.
 *
 * `new Date('2026-11-01')` se interpreta como UTC y en Mexico cae el dia
 * anterior; por eso las fechas de calendario se comparan como texto.
 */
export function fechaCalendario(valor: Date | string): string {
  if (valor instanceof Date) {
    const dosDigitos = (numero: number) => String(numero).padStart(2, '0');
    return `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
  }

  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
  if (coincidencia) {
    return coincidencia[0];
  }

  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? fechaCalendario(new Date()) : fechaCalendario(fecha);
}

/** Dias completos entre dos fechas de calendario (nunca negativos). */
export function diasEntre(desde: string, hasta: string): number {
  const inicio = Date.parse(`${fechaCalendario(desde)}T00:00:00Z`);
  const fin = Date.parse(`${fechaCalendario(hasta)}T00:00:00Z`);
  if (Number.isNaN(inicio) || Number.isNaN(fin)) {
    return 0;
  }
  return Math.max(0, Math.round((fin - inicio) / 86_400_000));
}

/**
 * Recargo devengado de una cuota a una fecha de corte.
 *
 * `montoBase` y `tasaDiaria` se aceptan como `unknown` porque llegan de
 * Postgres (`NUMERIC` se serializa como string en el driver `pg`) y de los DTO.
 */
export function calcularRecargoCuota(opciones: {
  montoBase: unknown;
  tasaDiaria: unknown;
  fechaLimite: unknown;
  fechaCorte?: Date | string;
}): RecargoCuota {
  const montoBase = aCentavos(opciones.montoBase);
  const tasaDiaria = aCentavos(opciones.tasaDiaria);
  const corte = fechaCalendario(opciones.fechaCorte ?? new Date());
  const diasAtraso = diasEntre(String(opciones.fechaLimite ?? corte), corte);

  // La tasa manda: sin recargo configurado no se inventa un cargo. Se redondea
  // una sola vez, sobre el total devengado, para no acumular centavos por dia.
  const montoRecargo = tasaDiaria > 0 ? aCentavos(tasaDiaria * diasAtraso) : 0;

  return {
    diasAtraso,
    tasaDiaria,
    montoRecargo,
    montoTotal: aCentavos(montoBase + montoRecargo),
  };
}
