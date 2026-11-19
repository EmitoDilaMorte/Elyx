/** Formato compartido por el panel de reportes y sus exportaciones. */

const MONEDA = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Importe en pesos. Cualquier valor no numerico se muestra como $0.00. */
export function moneda(valor: number | null | undefined): string {
  const numero = Number(valor ?? 0);
  return MONEDA.format(Number.isFinite(numero) ? numero : 0);
}

/** Importe compacto para ejes de grafica ($12.5k). */
export function monedaCompacta(valor: number): string {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero)) {
    return '$0';
  }
  if (Math.abs(numero) >= 1_000_000) {
    return `$${(numero / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(numero) >= 1_000) {
    return `$${(numero / 1_000).toFixed(0)}k`;
  }
  return `$${numero.toFixed(0)}`;
}

/** Porcentaje con 1 decimal por defecto. Recibe la fraccion (0.912 → 91.2%). */
export function porcentaje(fraccion: number, decimales = 1): string {
  const numero = Number(fraccion ?? 0);
  return `${(Number.isFinite(numero) ? numero * 100 : 0).toFixed(decimales)}%`;
}

/** Porcentaje que YA viene en escala 0-100 (lo que devuelve el backend). */
export function porcentajeDirecto(valor: number, decimales = 1): string {
  const numero = Number(valor ?? 0);
  return `${(Number.isFinite(numero) ? numero : 0).toFixed(decimales)}%`;
}

const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/** `2026-11` → `Nov 2026`. Si no coincide, devuelve el texto tal cual. */
export function formatearPeriodo(periodo: string): string {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  if (!coincidencia) {
    return periodo;
  }
  const anio = coincidencia[1];
  const mes = Number(coincidencia[2]);
  return mes >= 1 && mes <= 12 ? `${MESES[mes - 1]} ${anio}` : periodo;
}

/** `2026-11` → `Nov 26`, para ejes con poco espacio. */
export function formatearPeriodoCorto(periodo: string): string {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  if (!coincidencia) {
    return periodo;
  }
  const mes = Number(coincidencia[2]);
  return mes >= 1 && mes <= 12
    ? `${MESES[mes - 1]} ${coincidencia[1].slice(2)}`
    : periodo;
}

/** Fecha corta local a partir de un ISO. */
export function fechaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function fechaHoraLocal(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nombre de archivo seguro: sin acentos, espacios ni caracteres raros. */
export function slugArchivo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

/** Sufijo legible de los periodos elegidos, para el nombre del archivo. */
export function sufijoPeriodos(periodos: string[]): string {
  if (periodos.length === 0) {
    return 'todos';
  }
  if (periodos.length <= 2) {
    return periodos.join('-');
  }
  const ordenados = [...periodos].sort();
  return `${ordenados[0]}-a-${ordenados[ordenados.length - 1]}`;
}

export const ETIQUETA_ORIGEN: Record<string, string> = {
  COMPROBANTE: 'Manual',
  SPEI: 'Transferencia SPEI',
  STRIPE: 'Tarjeta',
};

export const ETIQUETA_ESTADO_COBRANZA: Record<string, string> = {
  AL_CORRIENTE: 'Al corriente',
  PENDIENTE: 'Pendiente',
  VENCIDO: 'Vencido',
};
