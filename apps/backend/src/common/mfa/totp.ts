import * as crypto from 'crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Codifica un buffer en base32 (RFC 4648, sin relleno). */
export function base32Codificar(buffer: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';

  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    salida += ALFABETO[(valor << (5 - bits)) & 31];
  }

  return salida;
}

/** Decodifica base32 sin distinguir mayusculas ni espacios. */
export function base32Decodificar(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];

  for (const caracter of limpio) {
    const indice = ALFABETO.indexOf(caracter);
    if (indice < 0) {
      continue;
    }
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generarSecreto(bytes = 20): string {
  return base32Codificar(crypto.randomBytes(bytes));
}

/** HOTP (RFC 4226). */
export function hotp(secreto: Buffer, contador: number, digitos = 6): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
  buffer.writeUInt32BE(contador % 0x100000000, 4);

  const hmac = crypto.createHmac('sha1', secreto).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/** TOTP (RFC 6238) con SHA-1, el algoritmo que acepta Microsoft Authenticator. */
export function totp(secretoBase32: string, instanteMs = Date.now(), periodo = 30, digitos = 6): string {
  const contador = Math.floor(instanteMs / 1000 / periodo);
  return hotp(base32Decodificar(secretoBase32), contador, digitos);
}

/** Verifica con ventana +/- `ventana` pasos para tolerar desfase de reloj. */
export function verificarTotp(
  secretoBase32: string,
  codigo: string,
  ventana = 1,
  instanteMs = Date.now(),
): boolean {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) {
    return false;
  }

  const paso = 30 * 1000;
  for (let delta = -ventana; delta <= ventana; delta += 1) {
    const esperado = totp(secretoBase32, instanteMs + delta * paso);
    const a = Buffer.from(esperado);
    const b = Buffer.from(limpio);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }

  return false;
}

export function otpauthUri(secretoBase32: string, cuenta: string, emisor = 'Elyx'): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  const parametros = new URLSearchParams({
    secret: secretoBase32,
    issuer: emisor,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${etiqueta}?${parametros.toString()}`;
}
