/**
 * Normalizacion de resultados de TypeORM.
 *
 * Con el driver de Postgres, `DataSource.query` devuelve formas distintas segun
 * el tipo de sentencia:
 *  - `SELECT`                      -> `Array<Row>`
 *  - `INSERT/UPDATE/DELETE ... RETURNING` -> `[Array<Row>, affectedCount]`
 *  - mutacion sin `RETURNING`      -> `[Array<Row>, affectedCount]` (filas vacias)
 *
 * Leer `resultado.length` sobre una mutacion da siempre `2`, y `resultado[0]`
 * es un arreglo en lugar de una fila. Eso hacia que el despachador reclamara las
 * entregas y despues no encontrara ningun id (quedaban en `EN_PROCESO` para
 * siempre), y que la retencion reportara conteos falsos.
 *
 * Este helper concentra la deteccion para no repetirla (ni olvidarla) en cada
 * servicio.
 */

/** Extrae las filas de un resultado de TypeORM. */
export function filasDe<T = Record<string, unknown>>(raw: unknown): T[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  // `[filas, conteo]`
  if (raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
    return (raw[0] as T[]) ?? [];
  }

  // Algunos drivers anidan un solo nivel para mutaciones sin conteo.
  if (raw.length > 0 && Array.isArray(raw[0])) {
    return (raw[0] as T[]) ?? [];
  }

  return raw as T[];
}

/** Filas afectadas por una mutacion, con o sin `RETURNING`. */
export function conteoDe(raw: unknown): number {
  if (!Array.isArray(raw)) {
    return 0;
  }

  if (raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
    return raw[1];
  }

  return raw.length;
}
