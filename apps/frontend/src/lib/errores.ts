/**
 * Extrae el mensaje legible de un error del API.
 *
 * `apiRequest` lanza un `Error` cuyo `message` incluye el cuerpo JSON de la
 * respuesta. Nest devuelve `message` como cadena o como arreglo (validacion de
 * `class-validator`), asi que hay que desenvolverlo antes de mostrarlo: al
 * usuario no le sirve ver el JSON crudo.
 */
export function extraerMensaje(error: unknown, porDefecto: string): string {
  const mensaje = String((error as { message?: string } | undefined)?.message ?? '');
  const inicioJson = mensaje.indexOf('{');
  if (inicioJson >= 0) {
    try {
      const data = JSON.parse(mensaje.slice(inicioJson)) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        return data.message.join(' ');
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
    } catch {
      /* se usa el mensaje crudo */
    }
  }
  return mensaje || porDefecto;
}
