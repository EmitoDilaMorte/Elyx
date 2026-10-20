import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import type { Response } from 'express';
import { RateLimitException } from '../../common/throttler/rate-limit.exception';
import { setRefreshCookie, clearRefreshCookie } from '../../common/auth/session-cookies';
import { CsrfService } from '../../common/csrf/csrf.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { Role } from '../../common/auth/role.enum';
import { MailService } from '../mail/mail.service';
import { LoginAttemptsService } from './login-attempts.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { MfaCanal, MfaMetodo, MfaService } from './mfa.service';
import { BehaviorService, ResumenComportamiento } from '../behavior/behavior.service';

type LoginMembership = {
  idUsuarioCondominio: number;
  idCondominio: number;
  rol: Role;
  estado: string;
  nombreCondominio: string;
  direccionCondominio: string;
};

type LoginUser = {
  idUsuario: number;
  nombre: string;
  correo: string;
  role: 'administrador' | 'condomino' | 'superusuario';
  requiereCambioPassword: boolean;
  membresias: LoginMembership[];
};

type MetaSesion = {
  ip?: string;
  userAgent?: string;
};

type SesionEmitida = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: LoginUser;
  behavior?: ResumenComportamiento | null;
};

type DesafioMfa = {
  mfaRequired: true;
  challengeId: string;
  metodos: MfaMetodo[];
  message: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly loginAttemptsService: LoginAttemptsService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly mfaService: MfaService,
    private readonly csrfService: CsrfService,
    private readonly behaviorService: BehaviorService,
  ) {}

  async login(
    input: LoginDto,
    ip?: string,
    res?: Response,
    userAgent?: string,
  ): Promise<SesionEmitida | DesafioMfa> {
    const correoNormalizado = input.correo.trim().toLowerCase();

    // Bloqueo progresivo por cuenta (Redis). Se revisa antes de tocar la base
    // de datos para cortar la fuerza bruta lo antes posible.
    const bloqueoSegundos = await this.loginAttemptsService.estaBloqueado(correoNormalizado);
    if (bloqueoSegundos > 0) {
      throw new RateLimitException(
        bloqueoSegundos,
        'Demasiados intentos fallidos para esta cuenta. Intenta de nuevo mas tarde.',
      );
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        u.id_usuario,
        u.nombre,
        u.primer_apellido,
        u.segundo_apellido,
        u.correo,
        u.password_hash,
        u.es_superusuario,
        u.requiere_cambio_password,
        uc.id_usuario_condominio,
        uc.id_condominio,
        uc.rol,
        uc.estado,
        c.nombre AS nombre_condominio,
        c.direccion AS direccion_condominio
      FROM usuarios u
      LEFT JOIN usuarios_condominios uc ON uc.id_usuario = u.id_usuario
      LEFT JOIN condominios c ON c.id_condominio = uc.id_condominio
      WHERE LOWER(u.correo) = LOWER($1)
      `,
      [correoNormalizado],
    );

    if (rows.length === 0) {
      await this.loginAttemptsService.registrarFallo(correoNormalizado, ip, 'usuario-no-encontrado');
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const first = rows[0] as Record<string, unknown>;
    const passwordHash = String(first.password_hash);
    const isValid = await this.validatePassword(input.password, passwordHash);

    if (!isValid) {
      const intento = await this.loginAttemptsService.registrarFallo(correoNormalizado, ip, 'password-incorrecta');
      if (intento.bloqueado) {
        throw new RateLimitException(
          intento.retryAfterSeconds,
          'Demasiados intentos fallidos para esta cuenta. Intenta de nuevo mas tarde.',
        );
      }
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    await this.loginAttemptsService.registrarExito(correoNormalizado, ip);

    const memberships = rows
      .filter((row: Record<string, unknown>) => row.id_usuario_condominio)
      .map((row: Record<string, unknown>): LoginMembership => ({
        idUsuarioCondominio: Number(row.id_usuario_condominio),
        idCondominio: Number(row.id_condominio),
        rol: String(row.rol) as Role,
        estado: String(row.estado),
        nombreCondominio: String(row.nombre_condominio ?? ''),
        direccionCondominio: String(row.direccion_condominio ?? ''),
      }));

    const esSuperusuario = Boolean(first.es_superusuario);
    const role: 'administrador' | 'condomino' | 'superusuario' = esSuperusuario
      ? 'superusuario'
      : memberships.some((item: LoginMembership) => item.rol === Role.ADMINISTRADOR)
        ? 'administrador'
        : 'condomino';

    const nombre = [first.nombre, first.primer_apellido, first.segundo_apellido]
      .filter((part) => Boolean(part))
      .map((part) => String(part))
      .join(' ')
      .trim();

    const user: LoginUser = {
      idUsuario: Number(first.id_usuario),
      nombre,
      correo: String(first.correo),
      role,
      requiereCambioPassword: esSuperusuario ? false : Boolean(first.requiere_cambio_password),
      membresias: memberships,
    };

    const payload = {
      sub: user.idUsuario,
      correo: user.correo,
      memberships: memberships.map((item: LoginMembership) => ({
        idUsuarioCondominio: item.idUsuarioCondominio,
        idCondominio: item.idCondominio,
        rol: item.rol,
      })),
      isSuperuser: esSuperusuario,
    };

    // Segundo factor: no se emite JWT hasta que el usuario verifique el codigo.
    const desafioMfa = await this.mfaService.crearDesafio(user.idUsuario);
    if (desafioMfa) {
      return {
        mfaRequired: true,
        challengeId: desafioMfa.challengeId,
        metodos: desafioMfa.metodos,
        message: 'Introduce el codigo de verificacion para continuar.',
      };
    }

    const behavior = input.behaviorSessionId
      ? await this.behaviorService.resumenSesion(input.behaviorSessionId)
      : null;

    if (behavior && behavior.verdict === 'bot' && process.env.BEHAVIOR_ENFORCE === 'strict') {
      throw new UnauthorizedException('Verificacion de comportamiento fallida. Intenta de nuevo.');
    }

    return this.finalizarSesion(user, payload, { ip, userAgent }, res, behavior);
  }

  /** Verifica el codigo MFA y solo entonces emite la sesion. */
  async verificarMfa(
    challengeId: string,
    codigo: string,
    metodo: MfaMetodo,
    res?: Response,
    meta: MetaSesion = {},
  ): Promise<SesionEmitida> {
    const { idUsuario } = await this.mfaService.verificar(challengeId, codigo, metodo);
    return this.emitirSesion(idUsuario, res, meta);
  }

  async reenviarMfa(challengeId: string): Promise<{ ok: true; message: string }> {
    return this.mfaService.reenviarOtp(challengeId);
  }

  async estadoMfa(idUsuario: number) {
    return this.mfaService.estado(idUsuario);
  }

  async iniciarAltaMfa(idUsuario: number) {
    return this.mfaService.iniciarAlta(idUsuario);
  }

  async activarMfa(idUsuario: number, codigo: string, canal: MfaCanal) {
    return this.mfaService.activar(idUsuario, codigo, canal);
  }

  async desactivarMfa(idUsuario: number, codigo: string) {
    return this.mfaService.desactivar(idUsuario, codigo);
  }

  /** Rota el refresh token y emite un access token nuevo. */
  async refrescar(token: string | undefined, res?: Response, meta: MetaSesion = {}): Promise<SesionEmitida> {
    if (!token) {
      throw new UnauthorizedException('Sesion expirada. Inicia sesion de nuevo.');
    }

    const nuevo = await this.refreshTokensService.rotar(token, meta);
    return this.emitirSesionConRefresh(nuevo.idUsuario, res, meta, nuevo);
  }

  async cerrarSesion(token: string | undefined, res?: Response): Promise<{ ok: true }> {
    await this.refreshTokensService.revocar(token);
    if (res) {
      clearRefreshCookie(res);
    }
    return { ok: true };
  }

  /** Emite (o rota) el token CSRF que el cliente copia a `X-CSRF-Token`. */
  emitirCsrf(res: Response): { csrfToken: string } {
    return { csrfToken: this.csrfService.emitir(res) };
  }

  private async emitirSesion(
    idUsuario: number,
    res: Response | undefined,
    meta: MetaSesion,
  ): Promise<SesionEmitida> {
    const { user, payload } = await this.cargarUsuario(idUsuario);
    return this.finalizarSesion(user, payload, meta, res, null);
  }

  private async emitirSesionConRefresh(
    idUsuario: number,
    res: Response | undefined,
    meta: MetaSesion,
    refresh: { token: string; expira: Date },
  ): Promise<SesionEmitida> {
    const { user, payload } = await this.cargarUsuario(idUsuario);
    return this.finalizarSesion(user, payload, meta, res, null, refresh);
  }

  private async finalizarSesion(
    user: LoginUser,
    payload: Record<string, unknown>,
    meta: MetaSesion,
    res: Response | undefined,
    behavior: ResumenComportamiento | null,
    refreshPrevio?: { token: string; expira: Date },
  ): Promise<SesionEmitida> {
    const expiresIn = process.env.ACCESS_TOKEN_TTL ?? process.env.JWT_EXPIRES_IN ?? '15m';

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET ?? 'elyx-dev-secret',
      expiresIn: expiresIn as never,
    });

    const refresh = refreshPrevio ?? (await this.refreshTokensService.emitir(user.idUsuario, meta));

    if (res) {
      setRefreshCookie(res, refresh.token, refresh.expira);
      // Al iniciar sesion se rota el token CSRF: el bot observa el cambio de
      // firma y lo reporta como "el token roto" en el punto 4.
      this.csrfService.emitir(res);
    }

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user,
      behavior,
    };
  }

  private async cargarUsuario(idUsuario: number): Promise<{
    user: LoginUser;
    payload: Record<string, unknown>;
  }> {
    const rows = (await this.dataSource.query(
      `
      SELECT
        u.id_usuario,
        u.nombre,
        u.primer_apellido,
        u.segundo_apellido,
        u.correo,
        u.es_superusuario,
        u.requiere_cambio_password,
        uc.id_usuario_condominio,
        uc.id_condominio,
        uc.rol,
        uc.estado,
        c.nombre AS nombre_condominio,
        c.direccion AS direccion_condominio
      FROM usuarios u
      LEFT JOIN usuarios_condominios uc ON uc.id_usuario = u.id_usuario
      LEFT JOIN condominios c ON c.id_condominio = uc.id_condominio
      WHERE u.id_usuario = $1
      `,
      [idUsuario],
    )) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      throw new UnauthorizedException('Sesion invalida.');
    }

    const { user, esSuperusuario, memberships } = this.construirUsuario(rows);

    const payload = {
      sub: user.idUsuario,
      correo: user.correo,
      memberships: memberships.map((item: LoginMembership) => ({
        idUsuarioCondominio: item.idUsuarioCondominio,
        idCondominio: item.idCondominio,
        rol: item.rol,
      })),
      isSuperuser: esSuperusuario,
    };

    return { user, payload };
  }

  private construirUsuario(rows: Array<Record<string, unknown>>): {
    user: LoginUser;
    esSuperusuario: boolean;
    memberships: LoginMembership[];
  } {
    const first = rows[0];

    const memberships = rows
      .filter((row) => row.id_usuario_condominio)
      .map((row): LoginMembership => ({
        idUsuarioCondominio: Number(row.id_usuario_condominio),
        idCondominio: Number(row.id_condominio),
        rol: String(row.rol) as Role,
        estado: String(row.estado),
        nombreCondominio: String(row.nombre_condominio ?? ''),
        direccionCondominio: String(row.direccion_condominio ?? ''),
      }));

    const esSuperusuario = Boolean(first.es_superusuario);
    const role: 'administrador' | 'condomino' | 'superusuario' = esSuperusuario
      ? 'superusuario'
      : memberships.some((item) => item.rol === Role.ADMINISTRADOR)
        ? 'administrador'
        : 'condomino';

    const nombre = [first.nombre, first.primer_apellido, first.segundo_apellido]
      .filter((part) => Boolean(part))
      .map((part) => String(part))
      .join(' ')
      .trim();

    const user: LoginUser = {
      idUsuario: Number(first.id_usuario),
      nombre,
      correo: String(first.correo),
      role,
      requiereCambioPassword: esSuperusuario ? false : Boolean(first.requiere_cambio_password),
      membresias: memberships,
    };

    return { user, esSuperusuario, memberships };
  }

  async updateProfileCorreo(idUsuario: number, correo: string) {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      throw new UnauthorizedException('Sesion invalida.');
    }

    const correoNormalizado = correo.trim().toLowerCase();

    const sameCorreoRows = await this.dataSource.query(
      `
      SELECT id_usuario
      FROM usuarios
      WHERE LOWER(correo) = $1
      LIMIT 1
      `,
      [correoNormalizado],
    );

    if (sameCorreoRows.length > 0 && Number(sameCorreoRows[0]?.id_usuario) !== idUsuario) {
      throw new BadRequestException('Ese correo ya esta registrado por otro usuario.');
    }

    const rows = await this.dataSource.query(
      `
      UPDATE usuarios
      SET correo = $2
      WHERE id_usuario = $1
      RETURNING id_usuario, correo
      `,
      [idUsuario, correoNormalizado],
    );

    if (rows.length === 0) {
      throw new BadRequestException('No se encontro el usuario para actualizar correo.');
    }

    return {
      idUsuario: Number(rows[0].id_usuario),
      correo: String(rows[0].correo),
    };
  }

  async changePassword(idUsuario: number, passwordActual: string, passwordNueva: string) {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      throw new UnauthorizedException('Sesion invalida.');
    }

    const rows = await this.dataSource.query(
      `
      SELECT password_hash
      FROM usuarios
      WHERE id_usuario = $1
      LIMIT 1
      `,
      [idUsuario],
    );

    if (rows.length === 0) {
      throw new BadRequestException('No se encontro el usuario para actualizar password.');
    }

    const passwordHash = String(rows[0].password_hash ?? '');
    const isValid = await this.validatePassword(passwordActual, passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('La password actual es incorrecta.');
    }

    const sameAsCurrent = await this.validatePassword(passwordNueva, passwordHash);
    if (sameAsCurrent) {
      throw new BadRequestException('La nueva password debe ser distinta a la actual.');
    }

    const hashNueva = await bcrypt.hash(passwordNueva, 10);

    await this.dataSource.query(
      `
      UPDATE usuarios
      SET password_hash = $2,
          requiere_cambio_password = FALSE
      WHERE id_usuario = $1
      `,
      [idUsuario, hashNueva],
    );

    return {
      ok: true,
      message: 'Password actualizada correctamente.',
    };
  }

  async forgotPassword(input: ForgotPasswordDto) {
    const correoNormalizado = input.correo.trim().toLowerCase();

    const rows = await this.dataSource.query(
      `SELECT id_usuario, nombre FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1`,
      [correoNormalizado],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Correo no registrado.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiracion = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    await this.dataSource.query(
      `
      INSERT INTO password_resets (correo, token, expiracion)
      VALUES ($1, $2, $3)
      `,
      [correoNormalizado, token, expiracion.toISOString()],
    );

    const nombre = String(rows[0].nombre ?? 'Usuario');
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const html = `
      <h2>Recuperacion de contraseña - Elyx</h2>
      <p>Hola ${nombre},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en Elyx.</p>
      <p>Usa el siguiente enlace para crear una nueva contraseña (valido por 30 minutos):</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Restablecer contraseña</a></p>
      <p>O copia este enlace en tu navegador:</p>
      <p>${resetUrl}</p>
      <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      <hr/>
      <p style="color:#888;">Elyx - Plataforma condominal</p>
    `;

    const envioOk = await this.mailService.sendEmail(correoNormalizado, 'Recuperacion de contraseña - Elyx', html);
    if (!envioOk) {
      throw new BadRequestException('Error al enviar el correo de recuperacion. Verifica la configuracion SMTP.');
    }

    return { ok: true, message: 'Correo de recuperacion enviado.' };
  }

  async validateResetToken(input: ValidateResetTokenDto) {
    const reset = await this.getResetTokenRecord(input.token);
    return {
      ok: true,
      correo: reset.correo,
      expiracion: reset.expiracion,
    };
  }

  async resetPassword(input: ResetPasswordDto) {
    const reset = await this.getResetTokenRecord(input.token);

    const hashNueva = await bcrypt.hash(input.passwordNueva, 10);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE usuarios SET password_hash = $1, requiere_cambio_password = FALSE WHERE LOWER(correo) = $2`,
        [hashNueva, reset.correo],
      );

      await manager.query(
        `UPDATE password_resets SET usado = TRUE WHERE token = $1`,
        [reset.token],
      );
    });

    // Cambiar la contraseña invalida cualquier sesion persistente anterior.
    await this.dataSource.query(
      `
      UPDATE refresh_tokens
      SET revocado = TRUE, revocado_en = CURRENT_TIMESTAMP
      WHERE revocado = FALSE
        AND id_usuario = (SELECT id_usuario FROM usuarios WHERE LOWER(correo) = $1)
      `,
      [reset.correo],
    );

    return { ok: true, message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesion.' };
  }

  private async validatePassword(rawPassword: string, passwordHash: string): Promise<boolean> {
    if (passwordHash.startsWith('$2')) {
      return bcrypt.compare(rawPassword, passwordHash);
    }

    return rawPassword === passwordHash;
  }

  private async getResetTokenRecord(rawToken: string) {
    const token = rawToken.trim();

    const rows = await this.dataSource.query(
      `
      SELECT pr.correo, pr.expiracion, pr.usado
      FROM password_resets pr
      WHERE pr.token = $1
      LIMIT 1
      `,
      [token],
    );

    if (rows.length === 0) {
      throw new BadRequestException('Token de recuperacion invalido.');
    }

    const reset = rows[0] as Record<string, unknown>;

    if (Boolean(reset.usado)) {
      throw new BadRequestException('Este enlace de recuperacion ya fue usado.');
    }

    if (new Date(String(reset.expiracion)) < new Date()) {
      throw new BadRequestException('El enlace de recuperacion ha expirado.');
    }

    return {
      correo: String(reset.correo).trim().toLowerCase(),
      expiracion: String(reset.expiracion),
      token,
    };
  }
}
