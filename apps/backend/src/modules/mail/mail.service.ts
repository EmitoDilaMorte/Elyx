import { Injectable, Logger } from '@nestjs/common';
import { aTextoPlano } from './mail.templates';

/** Dominios que Resend rechaza como remitente salvo que se verifiquen. */
const DOMINIOS_NO_VERIFICABLES = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
]);

export type TransporteCorreo = 'resend' | 'smtp' | 'console';

/** Corte de la peticion a Resend. Una red colgada no debe bloquear el despacho. */
const RESEND_TIMEOUT_MS = 15_000;

export type OpcionesCorreo = {
  /**
   * Clave de idempotencia (Resend). Si se reintenta el mismo envio, Resend
   * devuelve el mensaje original en lugar de duplicarlo.
   */
  idempotencyKey?: string;
  /** Direccion de respuesta visible para el usuario. */
  replyTo?: string;
  /** Etiqueta interna para filtrar en el panel del proveedor. */
  etiqueta?: string;
};

export type ResultadoEnvio = {
  ok: boolean;
  transporte: TransporteCorreo;
  /** Motivo legible cuando `ok` es false. Se guarda en `notificacion_entregas`. */
  error?: string;
  /** `true` si el envio se redirigio por `MAIL_OVERRIDE_TO`. */
  redirigido?: boolean;
};

/**
 * Envio de correo transaccional.
 *
 * Resolucion del transporte (`MAIL_PROVIDER`):
 *  - `resend`: Resend si hay `RESEND_API_KEY`.
 *  - `smtp`: SMTP si hay `SMTP_HOST`.
 *  - `auto` (default): Resend primero y SMTP como respaldo. Se prefiere Resend
 *    porque el dominio esta verificado y la entrega es mas confiable que un
 *    buzon personal; SMTP queda para pruebas locales.
 *  - `console`: no se envia nada, solo se registra en el log (sin credenciales).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    opciones: OpcionesCorreo = {},
  ): Promise<boolean> {
    const resultado = await this.enviar(to, subject, html, opciones);

    if (!resultado.ok) {
      this.logger.warn(`Correo no enviado a ${to} (${resultado.transporte}): ${resultado.error}`);
    }

    return resultado.ok;
  }

  /** Igual que `sendEmail` pero devuelve el motivo del fallo. */
  async enviar(
    to: string,
    subject: string,
    html: string,
    opciones: OpcionesCorreo = {},
  ): Promise<ResultadoEnvio> {
    const destino = (to ?? '').trim();
    if (!destino) {
      return { ok: false, transporte: this.proveedor(), error: 'destinatario-vacio' };
    }

    const override = (process.env.MAIL_OVERRIDE_TO ?? '').trim();
    const destinoReal = override || destino;
    const asuntoReal = override ? `[para: ${destino}] ${subject}` : subject;
    const transporte = this.proveedor();

    if (transporte === 'resend') {
      const key = (process.env.RESEND_API_KEY ?? '').trim();
      const resultado = await this.sendViaResend(destinoReal, asuntoReal, html, key, opciones);

      // Si Resend rechaza el remitente (dominio no verificado) y hay SMTP
      // configurado, se reintenta por ahi. Asi un `.env` con un remitente de
      // Gmail sigue enviando en lugar de dejar el correo muerto.
      if (!resultado.ok && (process.env.SMTP_HOST ?? '').trim()) {
        this.logger.warn(
          `Resend fallo (${resultado.error ?? 'sin detalle'}); se reintenta por SMTP.`,
        );
        const respaldo = await this.sendViaSmtp(destinoReal, asuntoReal, html, opciones);
        return { ...respaldo, redirigido: override ? true : undefined };
      }

      return { ...resultado, redirigido: override ? true : undefined };
    }

    if (transporte === 'smtp') {
      const resultado = await this.sendViaSmtp(destinoReal, asuntoReal, html, opciones);
      return { ...resultado, redirigido: override ? true : undefined };
    }

    this.logConsole(destinoReal, asuntoReal, html);
    return { ok: true, transporte: 'console', redirigido: override ? true : undefined };
  }

  /**
   * Transporte que se usaria en este momento (para diagnostico y UI).
   *
   * En `auto` Resend solo se elige si el remitente pertenece a un dominio
   * verificable. Con `SMTP_FROM` apuntando a un Gmail, Resend devolveria 422 y
   * el correo se perderia: en ese caso se usa SMTP.
   */
  proveedor(): TransporteCorreo {
    const forzado = (process.env.MAIL_PROVIDER ?? 'auto').trim().toLowerCase();
    const tieneSmtp = Boolean((process.env.SMTP_HOST ?? '').trim());
    const tieneResend = Boolean((process.env.RESEND_API_KEY ?? '').trim());

    if (forzado === 'smtp') {
      return tieneSmtp ? 'smtp' : 'console';
    }
    if (forzado === 'resend') {
      return tieneResend ? 'resend' : 'console';
    }
    if (forzado === 'console') {
      return 'console';
    }

    if (tieneResend && this.remitenteVerificable()) {
      return 'resend';
    }
    if (tieneSmtp) {
      return 'smtp';
    }
    return 'console';
  }

  /** `false` si el remitente es de un dominio que Resend no puede verificar. */
  remitenteVerificable(): boolean {
    const from = this.buildFrom();
    const correo = /<([^<>]+)>/.exec(from)?.[1] ?? from;
    return !this.esDominioNoVerificable(correo);
  }

  /** Remitente efectivo, ya normalizado a `Nombre <correo@dominio>`. */
  remitente(): string {
    return this.buildFrom();
  }

  /**
   * Construye un remitente valido: `Nombre <correo@dominio>`.
   *
   * Tolera las formas que la gente escribe en `.env`:
   *  - `correo@dominio`
   *  - `Nombre correo@dominio`   (sin corchetes: invalido para Resend y SMTP)
   *  - `"Nombre <correo@dominio>"` (con comillas literales del archivo)
   *  - `Nombre <correo@dominio>`
   */
  private buildFrom(): string {
    const bruto = process.env.SMTP_FROM;
    const limpio = this.limpiarComillas(bruto);

    if (limpio) {
      const conCorchetes = /^(.*?)\s*<([^<>@\s]+@[^<>\s]+)>\s*$/.exec(limpio);
      if (conCorchetes) {
        const nombre = conCorchetes[1].trim() || 'Elyx';
        return `${nombre} <${conCorchetes[2]}>`;
      }

      // "Nombre correo@dominio" -> "Nombre <correo@dominio>"
      const nombreYCorreo = /^(.*\S)\s+([^<>\s@]+@[^<>\s]+)$/.exec(limpio);
      if (nombreYCorreo) {
        return `${nombreYCorreo[1].trim()} <${nombreYCorreo[2]}>`;
      }

      if (/^[^<>\s@]+@[^<>\s]+$/.test(limpio)) {
        return `Elyx <${limpio}>`;
      }
    }

    const usuario = this.limpiarComillas(process.env.SMTP_USER);
    if (usuario && /^[^<>\s@]+@[^<>\s]+$/.test(usuario)) {
      return `Elyx <${usuario}>`;
    }

    return 'Elyx <no-reply@elyx-app.com>';
  }

  /** Quita comillas simples/dobles que docker deja literales desde el .env. */
  private limpiarComillas(valor: string | undefined): string {
    if (!valor) {
      return '';
    }
    return valor
      .trim()
      .replace(/^["']+/, '')
      .replace(/["']+$/, '')
      .trim();
  }

  private esDominioNoVerificable(correo: string): boolean {
    const dominio = correo.split('@')[1]?.toLowerCase() ?? '';
    return DOMINIOS_NO_VERIFICABLES.has(dominio);
  }

  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    apiKey: string,
    opciones: OpcionesCorreo,
  ): Promise<ResultadoEnvio> {
    try {
      const from = this.buildFrom();
      const correoRemitente = /<([^<>]+)>/.exec(from)?.[1] ?? from;

      // Resend solo admite remitentes de un dominio verificado en su panel.
      // Con Gmail/Hotmail el error del API es opaco (422): se avisa aqui.
      if (this.esDominioNoVerificable(correoRemitente)) {
        const error =
          `Resend no puede enviar desde "${correoRemitente}": su dominio no es verificable. ` +
          'Configura un dominio propio en Resend o usa SMTP (MAIL_PROVIDER=smtp).';
        this.logger.error(`[MAIL] ${error}`);
        return { ok: false, transporte: 'resend', error };
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (opciones.idempotencyKey) {
        headers['Idempotency-Key'] = opciones.idempotencyKey;
      }

      const payload: Record<string, unknown> = {
        from,
        to,
        subject,
        html,
        text: aTextoPlano(html),
      };
      if (opciones.replyTo) {
        payload.reply_to = opciones.replyTo;
      }
      if (opciones.etiqueta) {
        payload.tags = [{ name: 'categoria', value: opciones.etiqueta.slice(0, 60) }];
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        // Sin timeout, una red lenta deja la peticion abierta y el despachador
        // se queda esperando: la entrega queda `EN_PROCESO` y bloquea el lote.
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`[MAIL] Resend API error ${response.status}: ${body.slice(0, 400)}`);
        return {
          ok: false,
          transporte: 'resend',
          error: `resend-${response.status}: ${body.slice(0, 300)}`,
        };
      }

      return { ok: true, transporte: 'resend' };
    } catch (error) {
      const mensaje = (error as Error).message;
      this.logger.error(`[MAIL] Error enviando via Resend: ${mensaje}`);
      return { ok: false, transporte: 'resend', error: `resend-excepcion: ${mensaje}` };
    }
  }

  private async sendViaSmtp(
    to: string,
    subject: string,
    html: string,
    opciones: OpcionesCorreo,
  ): Promise<ResultadoEnvio> {
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      const error = 'SMTP_USER o SMTP_PASS no configurados.';
      this.logger.error(`[MAIL] ${error}`);
      return { ok: false, transporte: 'smtp', error };
    }

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      await transporter.sendMail({
        from: this.buildFrom(),
        to,
        subject,
        html,
        text: aTextoPlano(html),
        replyTo: opciones.replyTo,
      });

      return { ok: true, transporte: 'smtp' };
    } catch (error) {
      const mensaje = (error as Error).message;
      this.logger.error(`[MAIL] Error al enviar correo SMTP: ${mensaje}`);
      return { ok: false, transporte: 'smtp', error: `smtp: ${mensaje}` };
    }
  }

  private logConsole(to: string, subject: string, html: string) {
    this.logger.log('[MAIL] Sin configuracion de correo. Simulando envio:');
    this.logger.log(`  Para: ${to}`);
    this.logger.log(`  Asunto: ${subject}`);
    this.logger.log(`  Cuerpo: ${aTextoPlano(html).slice(0, 200)}`);
  }
}
