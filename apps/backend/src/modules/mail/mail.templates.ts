/**
 * Plantillas de correo de Elyx.
 *
 * Todas las plantillas pasan por `layoutElyx`, que arma un HTML simple y
 * compatible con clientes de correo (tablas y estilos en linea, sin flexbox ni
 * hojas externas). El pie incluye la razon por la que se recibe el mensaje y la
 * liga a la politica de privacidad, que es lo que piden los filtros de spam.
 *
 * Todo dato dinamico se escapa con `escapeHtml`: un nombre de condominio o un
 * asunto con `<` rompe el HTML y, en el peor caso, permite inyectar enlaces.
 */

const COLOR_FONDO = '#f5efe6';
const COLOR_TARJETA = '#ffffff';
const COLOR_MARCA = '#0a1226';
const COLOR_ACENTO = '#0a8a7c';
const COLOR_TEXTO = '#2a2320';
const COLOR_SUAVE = '#6b6259';
const COLOR_BORDE = '#e8e1d7';

export function escapeHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Quita etiquetas y normaliza espacios: util para el texto plano alternativo. */
export function aTextoPlano(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type LayoutInput = {
  /** Titulo visible dentro de la tarjeta. */
  titulo: string;
  /** Cuerpo ya escapado (usa `parrafo`, `lista` o `aviso` para armarlo). */
  cuerpo: string;
  /** Texto del boton; requiere `urlAccion`. */
  textoAccion?: string;
  urlAccion?: string;
  /** Nota pequena arriba del pie. */
  notaPie?: string;
  /** Etiqueta de clasificacion (ej. "Notificacion del condominio"). */
  categoria?: string;
};

/**
 * Envoltura comun. El ancho maximo es 560px porque es lo que Outlook y Gmail
 * renderizan igual en escritorio y movil.
 */
export function layoutElyx(input: LayoutInput): string {
  const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'https://elyx-app.com')
    .replace(/\/+$/, '');
  const urlPrivacidad = `${base}/politica-privacidad`;

  const boton =
    input.urlAccion && input.textoAccion
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
        <tr>
          <td style="border-radius:10px;background:${COLOR_ACENTO};">
            <a href="${escapeHtml(input.urlAccion)}"
               style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">
              ${escapeHtml(input.textoAccion)}
            </a>
          </td>
        </tr>
      </table>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLOR_SUAVE};word-break:break-all;margin:10px 0 0;">
        Si el boton no funciona, copia este enlace:<br/>
        <a href="${escapeHtml(input.urlAccion)}" style="color:${COLOR_ACENTO};">${escapeHtml(input.urlAccion)}</a>
      </p>`
      : '';

  const categoria = input.categoria
    ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${COLOR_ACENTO};margin:0 0 6px;">${escapeHtml(input.categoria)}</p>`
    : '';

  const notaPie = input.notaPie
    ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLOR_SUAVE};margin:0 0 10px;">${escapeHtml(input.notaPie)}</p>`
    : '';

  return `<!doctype html>
<html lang="es-MX">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.titulo)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOR_FONDO};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR_FONDO};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 14px;">
                <p style="font-family:'Trebuchet MS',Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${COLOR_MARCA};margin:0;">
                  Elyx
                </p>
                <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLOR_SUAVE};margin:2px 0 0;">
                  Administracion condominal
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:${COLOR_TARJETA};border:1px solid ${COLOR_BORDE};border-radius:14px;padding:26px 24px;">
                ${categoria}
                <h1 style="font-family:'Trebuchet MS',Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:${COLOR_MARCA};margin:0 0 14px;">
                  ${escapeHtml(input.titulo)}
                </h1>
                ${input.cuerpo}
                ${boton}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 6px 0;">
                ${notaPie}
                <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${COLOR_SUAVE};margin:0;">
                  Este mensaje se envio automaticamente, no respondas a esta direccion.
                  Si necesitas ayuda, contacta al administrador de tu condominio.
                </p>
                <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${COLOR_SUAVE};margin:8px 0 0;">
                  Elyx &middot; Plataforma condominal &middot;
                  <a href="${escapeHtml(urlPrivacidad)}" style="color:${COLOR_SUAVE};">Politica de privacidad</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Parrafo del cuerpo. El texto se escapa, no acepta HTML. */
export function parrafo(texto: string): string {
  return `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${COLOR_TEXTO};margin:0 0 12px;">${escapeHtml(texto)}</p>`;
}

/** Bloque destacado (advertencias, instrucciones importantes). */
export function aviso(texto: string, tono: 'info' | 'alerta' = 'info'): string {
  const borde = tono === 'alerta' ? '#f0d9a8' : '#cfe8e4';
  const fondo = tono === 'alerta' ? '#fff7e6' : '#eef7f5';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
    <tr>
      <td style="background:${fondo};border:1px solid ${borde};border-radius:10px;padding:12px 14px;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${COLOR_TEXTO};margin:0;">${escapeHtml(texto)}</p>
      </td>
    </tr>
  </table>`;
}

/** Lista de datos clave-valor (montos, referencias, fechas). */
export function datos(filas: Array<{ etiqueta: string; valor: string }>): string {
  const cuerpo = filas
    .map(
      (fila) => `<tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${COLOR_SUAVE};padding:6px 0;border-bottom:1px solid ${COLOR_BORDE};">${escapeHtml(fila.etiqueta)}</td>
        <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${COLOR_TEXTO};padding:6px 0;border-bottom:1px solid ${COLOR_BORDE};">${escapeHtml(fila.valor)}</td>
      </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">${cuerpo}</table>`;
}

/**
 * Correo generico de notificacion del condominio.
 *
 * `urlAccion` apunta al panel; el asunto y el mensaje vienen de la tabla
 * `notificaciones`, que ya los guardo con el texto final.
 */
export function plantillaNotificacion(input: {
  asunto: string;
  mensaje: string;
  nombreCondominio?: string | null;
  urlAccion?: string;
}): string {
  const cuerpo = [
    parrafo(input.mensaje),
    input.nombreCondominio ? datos([{ etiqueta: 'Condominio', valor: input.nombreCondominio }]) : '',
  ].join('');

  return layoutElyx({
    titulo: input.asunto,
    categoria: 'Notificacion',
    cuerpo,
    textoAccion: input.urlAccion ? 'Abrir Elyx' : undefined,
    urlAccion: input.urlAccion,
    notaPie: 'Recibes este correo porque tienes notificaciones por correo activadas en tu cuenta.',
  });
}

/** Recuperacion de contrasena. */
export function plantillaRecuperacion(input: { nombre: string; url: string; minutos: number }): string {
  return layoutElyx({
    titulo: 'Recupera tu contrasena',
    categoria: 'Seguridad',
    cuerpo: [
      parrafo(`Hola ${input.nombre},`),
      parrafo('Recibimos una solicitud para restablecer la contrasena de tu cuenta en Elyx.'),
      aviso(`El enlace es de un solo uso y vence en ${input.minutos} minutos.`),
      parrafo('Si no solicitaste este cambio, ignora este mensaje: tu contrasena actual sigue siendo valida.'),
    ].join(''),
    textoAccion: 'Restablecer contrasena',
    urlAccion: input.url,
  });
}

/** Codigo de verificacion de MFA. */
export function plantillaCodigoMfa(input: { nombre: string; codigo: string; minutos: number }): string {
  return layoutElyx({
    titulo: 'Tu codigo de verificacion',
    categoria: 'Seguridad',
    cuerpo: [
      parrafo(`Hola ${input.nombre},`),
      parrafo('Usa este codigo para completar tu inicio de sesion:'),
      `<p style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:0.35em;color:${COLOR_MARCA};margin:0 0 16px;text-align:center;">${escapeHtml(input.codigo)}</p>`,
      aviso(`El codigo vence en ${input.minutos} minutos. No lo compartas con nadie.`),
    ].join(''),
    notaPie: 'Si no intentaste iniciar sesion, cambia tu contrasena cuanto antes.',
  });
}

/** Invitacion a unirse a un condominio. */
export function plantillaInvitacion(input: {
  nombre: string;
  nombreCondominio: string;
  url: string;
  diasVigencia: number;
  correoExistente?: boolean;
}): string {
  return layoutElyx({
    titulo: `Te invitaron a ${input.nombreCondominio}`,
    categoria: 'Invitacion',
    cuerpo: [
      parrafo(`Hola ${input.nombre},`),
      parrafo(`El administrador de ${input.nombreCondominio} te invito a unirte al condominio en Elyx.`),
      input.correoExistente
        ? aviso('Ya tienes una cuenta en Elyx con este correo. Al aceptar, se agregara el nuevo condominio a tu cuenta y conservaras tu contrasena actual.', 'alerta')
        : aviso(`El enlace vence en ${input.diasVigencia} dias.`),
      parrafo('Con tu cuenta podras consultar cuotas, subir comprobantes de pago, votar en asambleas y recibir avisos.'),
    ].join(''),
    textoAccion: 'Aceptar invitacion',
    urlAccion: input.url,
  });
}

/** Verificacion de correo al crear un condominio. */
export function plantillaVerificacionRegistro(input: {
  nombre: string;
  nombreCondominio: string;
  url: string;
  horas: number;
  cuentaExistente?: boolean;
}): string {
  return layoutElyx({
    titulo: 'Confirma tu correo',
    categoria: 'Registro',
    cuerpo: [
      parrafo(`Hola ${input.nombre},`),
      parrafo(`Recibimos la solicitud para crear el condominio ${input.nombreCondominio} en Elyx.`),
      input.cuentaExistente
        ? aviso('Ya tienes una cuenta en Elyx con este correo. Al confirmar, se agregara tu acceso como administrador del nuevo condominio y conservaras tu contrasena actual.', 'alerta')
        : '',
      parrafo(`Confirma tu correo para continuar. El enlace vence en ${input.horas} horas.`),
      parrafo('Si no solicitaste esto, ignora este mensaje.'),
    ].join(''),
    textoAccion: 'Confirmar mi correo',
    urlAccion: input.url,
  });
}

/** Confirmacion de correo de una solicitud de alta por invitacion. */
export function plantillaConfirmacionSolicitud(input: {
  nombre: string;
  nombreCondominio: string;
  url: string;
  horas: number;
}): string {
  return layoutElyx({
    titulo: 'Confirma tu correo',
    categoria: 'Solicitud de alta',
    cuerpo: [
      parrafo(`Hola ${input.nombre},`),
      parrafo(`Recibimos tu solicitud para unirte a ${input.nombreCondominio} en Elyx.`),
      parrafo('Confirma tu correo para que el administrador pueda revisar tu solicitud.'),
      aviso(`El enlace vence en ${input.horas} horas.`),
      parrafo('Si no solicitaste esto, ignora este mensaje.'),
    ].join(''),
    textoAccion: 'Confirmar mi correo',
    urlAccion: input.url,
  });
}
