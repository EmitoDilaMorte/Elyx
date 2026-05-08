import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const resendKey = process.env.RESEND_API_KEY?.trim();

    if (resendKey) {
      return this.sendViaResend(to, subject, html, resendKey);
    }

    const smtpHost = process.env.SMTP_HOST?.trim();
    if (smtpHost) {
      return this.sendViaSmtp(to, subject, html);
    }

    this.logConsole(to, subject, html);
    return true;
  }

  private async sendViaResend(to: string, subject: string, html: string, apiKey: string): Promise<boolean> {
    try {
      const fromEnv = process.env.SMTP_FROM?.trim();
      const userEnv = process.env.SMTP_USER?.trim();
      let from: string;
      if (fromEnv) {
        from = fromEnv;
      } else if (userEnv) {
        from = `Elyx <${userEnv}>`;
      } else {
        from = 'Elyx <no-reply@elyx.mx>';
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
