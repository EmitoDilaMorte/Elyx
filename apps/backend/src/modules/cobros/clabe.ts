/**
 * Validacion de CLABE (Clave Bancaria Estandarizada).
 *
 * Una CLABE son 18 digitos:
 *   3  banco
 *   3  plaza (sucursal)
 *   11 cuenta
 *   1  digito verificador
 *
 * El digito verificador se calcula con pesos [3,7,1] aplicados de izquierda a
 * derecha sobre los primeros 17 digitos. Validarlo evita guardar una cuenta a
 * la que el condomino nunca podra transferir, y es un error que se detecta al
 * capturar, no cuando el dinero no llega.
 */

const PESOS = [3, 7, 1] as const;

/** Calcula el digito verificador de los primeros 17 digitos. */
export function digitoVerificadorClabe(digitos: string): number | null {
  if (!/^\d{17}$/.test(digitos)) {
    return null;
  }

  let suma = 0;
  for (let i = 0; i < 17; i += 1) {
    suma += Number(digitos[i]) * PESOS[i % 3];
  }

  // El verificador es (10 - (suma mod 10)) mod 10.
  return (10 - (suma % 10)) % 10;
}

/**
 * `true` si la CLABE es valida: 18 digitos y el verificador coincide.
 *
 * No valida que el banco exista ni que la cuenta este activa: eso solo lo sabe
 * el banco. Aqui se atrapa el error de captura.
 */
export function esClabeValida(clabe: string | null | undefined): boolean {
  const limpia = String(clabe ?? '').replace(/\s+/g, '');
  if (!/^\d{18}$/.test(limpia)) {
    return false;
  }

  const esperado = digitoVerificadorClabe(limpia.slice(0, 17));
  return esperado !== null && esperado === Number(limpia[17]);
}

/** Mensaje accionable cuando la CLABE no pasa la validacion. */
export const MENSAJE_CLABE_INVALIDA =
  'La CLABE debe tener 18 digitos y un digito verificador correcto. Revísala con tu banco antes de guardarla.';
