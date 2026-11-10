import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Cabeceras de seguridad del backend.
 *
 * El frontend ya las pone en `nginx.conf`, pero el API se sirve en **otro
 * origen** (`api.elyx-app.com`), asi que sus respuestas no las heredan. Un
 * endpoint que devuelve JSON tambien necesita `nosniff` y `no-store`: sin
 * `no-store`, un proxy o el disco del navegador pueden cachear una respuesta
 * con datos de otro usuario.
 *
 * Tres ajustes que NO son los valores por defecto de helmet, y por que:
 *
 *  - `crossOriginResourcePolicy: 'cross-origin'`: helmet usa `same-origin`, que
 *    bloquea las imagenes de `/uploads` (comprobantes y evidencias) cuando el
 *    navegador las carga desde el dominio del frontend. Con el valor por
 *    defecto, las fotos de mantenimiento se verian rotas sin error visible.
 *
 *  - `contentSecurityPolicy` propia: un API devuelve JSON, no documentos, asi
 *    que la politica puede ser `default-src 'none'`. El valor por defecto de
 *    helmet permite `'self'`, que un API no necesita. Se desactiva la directiva
 *    `upgrade-insecure-requests` porque sobre HTTP local forzaria HTTPS.
 *
 *  - `strictTransportSecurity` solo en produccion: en desarrollo se sirve por
 *    HTTP y una cabecera HSTS dejaria el navegador intentando HTTPS contra
 *    localhost durante meses.
 */
export function aplicarCabecerasSeguridad(app: NestExpressApplication): void {
  const enProduccion = process.env.NODE_ENV === 'production';

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          // Un API no carga recursos: si alguna vez se sirve HTML desde aqui,
          // no podra ejecutar scripts ni incrustar nada.
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          // Sin `upgrade-insecure-requests`: sobre HTTP local romperia las
          // peticiones del propio frontend de desarrollo.
          'upgrade-insecure-requests': null,
        },
      },
      // Las imagenes de /uploads se consumen desde el origen del frontend.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Necesario para que Stripe pueda incrustar nada aqui; el backend no se
      // embebe, pero `deny` es mas estricto que `sameorigin` y no cuesta nada.
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      // HSTS solo cuando hay TLS. Incluye subdominios porque el API vive en uno.
      strictTransportSecurity: enProduccion
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
        : false,
      // `X-Powered-By: Express` no aporta nada y revela el stack.
      hidePoweredBy: true,
    }),
  );

  // Respuestas del API: datos personales y financieros. Que no se guarden en
  // cache ni en el disco del navegador.
  //
  // `/uploads` queda fuera a proposito: son comprobantes e imagenes de
  // mantenimiento con nombre que no cambia, y el frontend las muestra una y
  // otra vez. Marcarlas `no-store` obligaria a reenviarlas en cada apertura.
  app.use(
    (
      req: { path?: string },
      res: { setHeader: (k: string, v: string) => void },
      next: () => void,
    ) => {
      if (!String(req.path ?? '').startsWith('/uploads')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
      }
      next();
    },
  );
}
