import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { toDataURL as qrToDataURL } from 'qrcode';
import { MailService } from '../mail/mail.service';
import { otpauthUri, verificarTotp, generarSecreto } from '../../common/mfa/totp';

export type MfaCanal = 'TOTP' | 'EMAIL' | 'AMBOS';
export type MfaMetodo = 'TOTP' | 'EMAIL';

type DesafioMfa = {
  idUsuario: number;
  correo: string;
  canal: MfaCanal;
  otpHash?: string;
};

type FilaUsuarioMfa = {
  id_usuario: number;
  correo: string;
  mfa_habilitado: boolean;
  mfa_canal: string;
  mfa_secreto: string | null;
};

const CHALLENGE_TTL_SEGUNDOS = 5 * 60;
const SETUP_TTL_SEGUNDOS = 10 * 60;
const MAX_INTENTOS = 5;

/**
 * Segundo factor: TOTP (compatible con Microsoft Authenticator y cualquier app
 * RFC 6238) y OTP de 6 digitos por correo como alternativa.
 *
 * Los desafios viven en Redis (TTL corto) y el secreto TOTP se guarda cifrado
 * con AES-256-GCM en PostgreSQL.
 */
@Injectable()
export class MfaService implements OnModuleDestroy {
  private readonly logger = new Logger(MfaService.name);
  private readonly redis: Redis;

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis no disponible para MFA: ${String(error)}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async estado(idUsuario: number): Promise<{ habilitado: boolean; canal: MfaCanal }> {
    const fila = await this.filaUsuario(idUsuario);
    return { habilitado: Boolean(fila.mfa_habilitado), canal: this.normalizarCanal(fila.mfa_canal) };
  }

  /**
   * Crea un desafio para el usuario ya autenticado con password.
   * Devuelve `null` si el usuario no tiene MFA habilitado.
   */
  async crearDesafio(idUsuario: number): Promise<{ challengeId: string; metodos: MfaMetodo[] } | null> {
    const fila = await this.filaUsuario(idUsuario);
    if (!fila.mfa_habilitado) {
      return null;
    }

    const canal = this.normalizarCanal(fila.mfa_canal);
    const metodos: MfaMetodo[] = canal === 'AMBOS' ? ['TOTP', 'EMAIL'] : [canal];
    const challengeId = crypto.randomBytes(16).toString('hex');

    const desafio: DesafioMfa = { idUsuario, correo: fila.correo, canal };

    if (metodos.includes('EMAIL')) {
      const codigo = this.generarCodigo();
      desafio.otpHash = this.hashCodigo(challengeId, codigo);
      const envioOk = await this.enviarOtpCorreo(fila.correo, codigo);
      if (!envioOk && canal === 'EMAIL') {
        throw new BadRequestException('No se pudo enviar el codigo de verificacion por correo.');
      }
    }

    await this.redis.set(
      `mfa:challenge:${challengeId}`,
      JSON.stringify(desafio),
      'EX',
      CHALLENGE_TTL_SEGUNDOS,
    );

    return { challengeId, metodos };
  }

  async reenviarOtp(challengeId: string): Promise<{ ok: true; message: string }> {
    const desafio = await this.leerDesafio(challengeId);

    if (desafio.canal !== 'EMAIL' && desafio.canal !== 'AMBOS') {
      throw new BadRequestException('Este usuario no tiene MFA por correo habilitado.');
    }

    const bloqueo = await this.redis.set(`mfa:resend:${challengeId}`, '1', 'EX', 60, 'NX');
    if (bloqueo === null) {
      throw new BadRequestException('Espera un minuto antes de pedir otro codigo.');
    }

    const codigo = this.generarCodigo();
    desafio.otpHash = this.hashCodigo(challengeId, codigo);
    await this.redis.set(
      `mfa:challenge:${challengeId}`,
      JSON.stringify(desafio),
      'EX',
      CHALLENGE_TTL_SEGUNDOS,
    );

    const envioOk = await this.enviarOtpCorreo(desafio.correo, codigo);
    if (!envioOk) {
      throw new BadRequestException('No se pudo enviar el codigo de verificacion por correo.');
    }

    return { ok: true, message: 'Codigo de verificacion reenviado.' };
  }

  /** Verifica el codigo del desafio y devuelve el usuario autenticado. */
  async verificar(challengeId: string, codigo: string, metodo: MfaMetodo): Promise<{ idUsuario: number }> {
    const desafio = await this.leerDesafio(challengeId);
    const claveIntentos = `mfa:intentos:${challengeId}`;
    const intentos = await this.redis.incr(claveIntentos);
    await this.redis.expire(claveIntentos, CHALLENGE_TTL_SEGUNDOS);

    if (intentos > MAX_INTENTOS) {
      await this.redis.del(`mfa:challenge:${challengeId}`, claveIntentos);
      throw new UnauthorizedException('Demasiados intentos de verificacion. Inicia sesion de nuevo.');
    }

    const valido =
      metodo === 'EMAIL'
        ? this.verificarOtpCorreo(desafio, challengeId, codigo)
        : await this.verificarTotpORecuperacion(desafio.idUsuario, codigo);

    if (!valido) {
      throw new UnauthorizedException('Codigo de verificacion invalido.');
    }

    await this.redis.del(`mfa:challenge:${challengeId}`, claveIntentos);
    return { idUsuario: desafio.idUsuario };
  }

  /** Genera un secreto TOTP temporal (aun no activa MFA) y su QR. */
  async iniciarAlta(
    idUsuario: number,
  ): Promise<{ secreto: string; otpauthUri: string; qrDataUrl: string | null }> {
    const fila = await this.filaUsuario(idUsuario);
    const secreto = this.generarSecretoBase32();
    const uri = otpauthUri(secreto, fila.correo);

    await this.redis.set(`mfa:setup:${idUsuario}`, secreto, 'EX', SETUP_TTL_SEGUNDOS);

    // El QR se genera en el servidor: el secreto no viaja a ningun servicio
    // externo (evita depender de APIs de terceros para dibujar el codigo).
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await qrToDataURL(uri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240,
      });
    } catch (error) {
      // Si fallara el render, el alta sigue disponible con el secreto manual.
      this.logger.warn(`No se pudo generar el QR de MFA: ${String(error)}`);
    }

    return { secreto, otpauthUri: uri, qrDataUrl };
  }

  /** Confirma el alta con el primer codigo de la app autenticadora. */
  async activar(idUsuario: number, codigo: string, canal: MfaCanal): Promise<{ recoveryCodes: string[] }> {
    const secreto = await this.redis.get(`mfa:setup:${idUsuario}`);
    if (!secreto) {
      throw new BadRequestException('El alta de MFA expiro. Genera un secreto nuevo.');
    }

    if (!verificarTotp(secreto, codigo)) {
      throw new BadRequestException('El codigo no coincide con la app autenticadora.');
    }

    await this.dataSource.query(
      `
      UPDATE usuarios
      SET mfa_habilitado = TRUE,
          mfa_canal = $2,
          mfa_secreto = $3,
          mfa_confirmado_en = CURRENT_TIMESTAMP
      WHERE id_usuario = $1
      `,
      [idUsuario, canal, this.cifrar(secreto)],
    );

    await this.redis.del(`mfa:setup:${idUsuario}`);

    const recoveryCodes = await this.regenerarCodigosRecuperacion(idUsuario);
    return { recoveryCodes };
  }

  async desactivar(idUsuario: number, codigo: string): Promise<{ ok: true }> {
    const fila = await this.filaUsuario(idUsuario);
    if (!fila.mfa_habilitado || !fila.mfa_secreto) {
      throw new BadRequestException('El usuario no tiene MFA habilitado.');
    }

    const secreto = this.descifrar(fila.mfa_secreto);
    const valido = verificarTotp(secreto, codigo) || (await this.consumirCodigoRecuperacion(idUsuario, codigo));
    if (!valido) {
      throw new BadRequestException('Codigo de verificacion invalido.');
    }

    await this.dataSource.query(
      `
      UPDATE usuarios
      SET mfa_habilitado = FALSE, mfa_secreto = NULL, mfa_confirmado_en = NULL
      WHERE id_usuario = $1
      `,
      [idUsuario],
    );

    return { ok: true };
  }

  private async filaUsuario(idUsuario: number): Promise<FilaUsuarioMfa> {
    const rows = (await this.dataSource.query(
      `
      SELECT id_usuario, correo, mfa_habilitado, mfa_canal, mfa_secreto
      FROM usuarios
      WHERE id_usuario = $1
      LIMIT 1
      `,
      [idUsuario],
    )) as FilaUsuarioMfa[];

    if (rows.length === 0) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return rows[0];
  }

  private normalizarCanal(valor: string): MfaCanal {
    return valor === 'EMAIL' || valor === 'AMBOS' ? valor : 'TOTP';
  }

  private async leerDesafio(challengeId: string): Promise<DesafioMfa> {
    const raw = await this.redis.get(`mfa:challenge:${challengeId}`);
    if (!raw) {
      throw new UnauthorizedException('El desafio MFA expiro. Inicia sesion de nuevo.');
    }
    return JSON.parse(raw) as DesafioMfa;
  }

  private verificarOtpCorreo(desafio: DesafioMfa, challengeId: string, codigo: string): boolean {
    if (!desafio.otpHash) {
      return false;
    }
    return this.compararSeguro(desafio.otpHash, this.hashCodigo(challengeId, codigo));
  }

  private async verificarTotpORecuperacion(idUsuario: number, codigo: string): Promise<boolean> {
    const fila = await this.filaUsuario(idUsuario);
    if (fila.mfa_secreto) {
      try {
        if (verificarTotp(this.descifrar(fila.mfa_secreto), codigo)) {
          return true;
        }
      } catch {
        /* secreto corrupto: se intenta con los codigos de recuperacion */
      }
    }
    return this.consumirCodigoRecuperacion(idUsuario, codigo);
  }

  private async regenerarCodigosRecuperacion(idUsuario: number): Promise<string[]> {
    const codigos: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const bruto = crypto.randomBytes(5).toString('hex');
      codigos.push(`${bruto.slice(0, 5)}-${bruto.slice(5)}`);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM mfa_recovery_codes WHERE id_usuario = $1', [idUsuario]);
      for (const codigo of codigos) {
        await manager.query(
          'INSERT INTO mfa_recovery_codes (id_usuario, codigo_hash) VALUES ($1, $2)',
          [idUsuario, this.hashRecuperacion(codigo)],
        );
      }
    });

    return codigos;
  }

  private async consumirCodigoRecuperacion(idUsuario: number, codigo: string): Promise<boolean> {
    const limpio = codigo.trim().toLowerCase();
    if (!/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(limpio)) {
      return false;
    }

    const rows = (await this.dataSource.query(
      `
      UPDATE mfa_recovery_codes
      SET usado = TRUE, usado_en = CURRENT_TIMESTAMP
      WHERE id_codigo = (
        SELECT id_codigo FROM mfa_recovery_codes
        WHERE id_usuario = $1 AND codigo_hash = $2 AND usado = FALSE
        LIMIT 1
      )
      RETURNING id_codigo
      `,
      [idUsuario, this.hashRecuperacion(limpio)],
    )) as Array<{ id_codigo: number }>;

    return rows.length > 0;
  }

  private hashRecuperacion(codigo: string): string {
    return crypto
      .createHash('sha256')
      .update(`${codigo.trim().toLowerCase()}${this.claveCifrado().toString('hex')}`)
      .digest('hex');
  }

  private generarCodigo(): string {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private hashCodigo(challengeId: string, codigo: string): string {
    return crypto
      .createHmac('sha256', this.claveCifrado())
      .update(`${challengeId}:${codigo.trim()}`)
      .digest('hex');
  }

  private compararSeguro(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  private async enviarOtpCorreo(correo: string, codigo: string): Promise<boolean> {
    const html = `
      <h2>Codigo de verificacion - Elyx</h2>
      <p>Tu codigo de verificacion es:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:bold;">${codigo}</p>
      <p>Vale por 5 minutos. Si no intentaste iniciar sesion, ignora este mensaje.</p>
      <hr/>
      <p style="color:#888;">Elyx - Plataforma condominal</p>
    `;
    return this.mailService.sendEmail(correo, 'Codigo de verificacion - Elyx', html);
  }

  private generarSecretoBase32(): string {
    // 20 bytes aleatorios en base32 (RFC 4226 recomienda 160 bits).
    return generarSecreto(20);
  }

  private claveCifrado(): Buffer {
    const material = process.env.MFA_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim() || 'elyx-dev-mfa-key';
    return crypto.createHash('sha256').update(material).digest();
  }

  private cifrar(texto: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.claveCifrado(), iv);
    const datos = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.');
  }

  private descifrar(paquete: string): string {
    const [ivB64, tagB64, datosB64] = paquete.split('.');
    if (!ivB64 || !tagB64 || !datosB64) {
      throw new Error('Secreto MFA con formato invalido.');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.claveCifrado(),
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(datosB64, 'base64url')), decipher.final()]).toString('utf8');
  }
}
