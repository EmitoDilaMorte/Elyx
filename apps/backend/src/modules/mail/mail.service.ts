import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      console.log(`[MAIL] SMTP no configurado. Simulando envio:`);
      console.log(`  Para: ${to}`);
      console.log(`  Asunto: ${subject}`);
      console.log(`  Cuerpo: ${html.replace(/<[^>]*>/g, '').slice(0, 200)}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to,
        subject,
        html,
      });
      return true;
    } catch (error) {
      console.error('[MAIL] Error al enviar correo:', error);
      return false;
    }
  }
}
