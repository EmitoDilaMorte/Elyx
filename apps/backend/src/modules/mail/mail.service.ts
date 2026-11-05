import { Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const proveedor = this.proveedor();

    if (proveedor === 'resend') {
      const key = (process.env.RESEND_API_KEY ?? '').trim();
      return this.sendViaResend(to, subject, html, key);
    }

    if (proveedor === 'smtp') {
      return this.sendViaSmtp(to, subject, html);
    }

    this.logConsole(to, subject, html);
    return true;
  }

  /**
   * Resuelve el transporte. `MAIL_PROVIDER` permite forzarlo; en `auto` se
   * prefiere SMTP porque cualquier buzon real sirve, mientras que Resend exige
   * un dominio propio verificado en su panel.
   */
  private proveedor(): 'smtp' | 'resend' | 'console' {
    const forzado = (process.env.MAIL_PROVIDER ?? 'auto').trim().toLowerCase();
    const tieneSmtp = Boolean((process.env.SMTP_HOST ?? '').trim());
    const tieneResend = Boolean((process.env.RESEND_API_KEY ?? '').trim());

    if (forzado === 'smtp') {
      return tieneSmtp ? 'smtp' : 'console';
    }
    if (forzado === 'resend') {
      return tieneResend ? 'resend' : 'console';
    }

    if (tieneSmtp) {
      return 'smtp';
    }
    if (tieneResend) {
      return 'resend';
    }
    return 'console';
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

    return 'Elyx <no-reply@elyx.mx>';
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

  private async sendViaResend(to: string, subject: string, html: string, apiKey: string): Promise<boolean> {
    try {
      const from = this.buildFrom();
      const correoRemitente = /<([^<>]+)>/.exec(from)?.[1] ?? from;

      // Resend solo admite remitentes de un dominio verificado en su panel.
      // Con Gmail/Hotmail el error del API es opaco (422): se avisa aqui.
      if (this.esDominioNoVerificable(correoRemitente)) {
        console.error(
          `[MAIL] Resend no puede enviar desde "${correoRemitente}": su dominio no es verificable. ` +
            'Configura un dominio propio en Resend o usa SMTP (MAIL_PROVIDER=smtp).',
        );
        return false;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('[MAIL] Resend API error:', response.status, body);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[MAIL] Error enviando via Resend:', error);
      return false;
    }
  }

  private async sendViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
    const nodemailer = await import('nodemailer');
    const host = process.env.SMTP_HOST!;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      console.error('[MAIL] SMTP_USER o SMTP_PASS no configurados.');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? user,
        to,
        subject,
        html,
      });
      return true;
    } catch (error) {
      console.error('[MAIL] Error al enviar correo SMTP:', error);
      return false;
    }
  }

  private logConsole(to: string, subject: string, html: string) {
    console.log(`[MAIL] Sin configuracion de correo. Simulando envio:`);
    console.log(`  Para: ${to}`);
    console.log(`  Asunto: ${subject}`);
    console.log(`  Cuerpo: ${html.replace(/<[^>]*>/g, '').slice(0, 200)}`);
  }
}
