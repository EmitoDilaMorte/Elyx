/**
 * Logo para los PDF, con respaldo en cascada.
 *
 * Se prefiere el icono de 192 px (43 KB) antes que `elyx-logo.png` (1.1 MB):
 * en el documento se dibuja a ~30 pt, asi que la resolucion grande solo engorda
 * el archivo. `pdf-lib` incrusta los bytes originales del PNG, no la version
 * escalada.
 */
const CANDIDATOS = ['/web-app-manifest-192x192.png', '/apple-touch-icon.png', '/elyx-logo.png'];

export async function cargarLogo(): Promise<ArrayBuffer | null> {
  for (const ruta of CANDIDATOS) {
    try {
      const respuesta = await fetch(ruta, { cache: 'force-cache' });
      if (respuesta.ok) {
        return await respuesta.arrayBuffer();
      }
    } catch {
      // Se prueba el siguiente candidato.
    }
  }

  return null;
}
