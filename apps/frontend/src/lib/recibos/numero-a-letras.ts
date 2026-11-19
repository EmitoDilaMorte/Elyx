/**
 * Importe en letras para los recibos (espanol de Mexico).
 *
 * Se usa la forma apocopada correcta: "UN PESO", "VEINTIUN PESOS",
 * "CIEN PESOS", "MIL PESOS", "UN MILLON DE PESOS". El objetivo es que el
 * recibo se pueda leer y cotejar sin depender del numero impreso.
 */

const UNIDADES = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
];

const DECENAS = [
  '',
  '',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];

/** 21 a 29 se escriben en una sola palabra (VEINTIUNO, VEINTIDOS...). */
const VEINTENAS = [
  '',
  'VEINTIUNO',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];

const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

/** Convierte un entero entre 0 y 999 a letras. */
function hasta999(numero: number): string {
  if (numero === 0) {
    return '';
  }
  if (numero === 100) {
    return 'CIEN';
  }

  const partes: string[] = [];
  const centenas = Math.floor(numero / 100);
  const resto = numero % 100;

  if (centenas > 0) {
    partes.push(CENTENAS[centenas]);
  }

  if (resto > 0) {
    if (resto <= 20) {
      partes.push(UNIDADES[resto]);
    } else if (resto < 30) {
      partes.push(VEINTENAS[resto - 20]);
    } else {
      const decena = Math.floor(resto / 10);
      const unidad = resto % 10;
      partes.push(unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`);
    }
  }

  return partes.filter(Boolean).join(' ');
}

/** Forma apocopada: UNO → UN (antes de MIL o MILLON). */
function apocope(texto: string): string {
  return texto === 'UNO' ? 'UN' : texto.replace(/UNO$/, 'UN');
}

/** Convierte un entero positivo completo a letras. */
export function numeroALetras(valor: number): string {
  const numero = Math.floor(Math.abs(Number(valor) || 0));

  if (numero === 0) {
    return 'CERO';
  }
  if (numero < 1000) {
    return hasta999(numero);
  }

  if (numero < 1_000_000) {
    const miles = Math.floor(numero / 1000);
    const resto = numero % 1000;
    const prefijo = miles === 1 ? 'MIL' : `${apocope(hasta999(miles))} MIL`;
    return resto > 0 ? `${prefijo} ${hasta999(resto)}` : prefijo;
  }

  const millones = Math.floor(numero / 1_000_000);
  const restoMillones = numero % 1_000_000;
  const prefijo =
    millones === 1 ? 'UN MILLON' : `${apocope(hasta999(millones))} MILLONES`;

  if (restoMillones === 0) {
    return prefijo;
  }

  // "UN MILLON DE PESOS" pero "UN MILLON DOSCIENTOS MIL PESOS".
  const conector = restoMillones < 1000 ? ' ' : ' ';
  return `${prefijo}${conector}${numeroALetras(restoMillones)}`;
}

/**
 * Importe completo en letras: `MIL DOSCIENTOS PESOS 00/100 M.N.`
 *
 * Los centavos se imprimen con dos digitos y la moneda por defecto es MXN.
 */
export function importeEnLetras(valor: number, moneda = 'M.N.'): string {
  const importe = Number(valor);
  if (!Number.isFinite(importe) || importe < 0) {
    return `CERO PESOS 00/100 ${moneda}`;
  }

  const entero = Math.floor(importe);
  const centavos = Math.round((importe - entero) * 100);
  // `Math.round` puede devolver 100 cuando los centavos son .995.
  const enterosFinales = centavos === 100 ? entero + 1 : entero;
  const centavosFinales = centavos === 100 ? 0 : centavos;

  const letras = numeroALetras(enterosFinales);
  const sufijo = enterosFinales === 1 ? 'PESO' : 'PESOS';
  const centavosTexto = String(centavosFinales).padStart(2, '0');

  // En singular la forma correcta es "UN PESO", no "UNO PESO".
  const letrasFinales = enterosFinales === 1 ? 'UN' : letras;

  return `${letrasFinales} ${sufijo} ${centavosTexto}/100 ${moneda}`;
}
