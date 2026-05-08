import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenDto } from './dto/validate-reset-token.dto';
import { Role } from '../../common/auth/role.enum';
import { MailService } from '../mail/mail.service';

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

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async login(input: LoginDto) {
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
      [input.correo.trim()],
    );

    if (rows.length === 0) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const first = rows[0] as Record<string, unknown>;
    const passwordHash = String(first.password_hash);
    const isValid = await this.validatePassword(input.password, passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

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

    const expiresIn = process.env.JWT_EXPIRES_IN ?? '8h';

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET ?? 'elyx-dev-secret',
      expiresIn: expiresIn as never,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user,
    };
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
      <h2>Recuperacion de contrasena - Elyx</h2>
      <p>Hola ${nombre},</p>
      <p>Recibimos una solicitud para restablecer tu contrasena en Elyx.</p>
      <p>Usa el siguiente enlace para crear una nueva contrasena (valido por 30 minutos):</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Restablecer contrasena</a></p>
      <p>O copia este enlace en tu navegador:</p>
      <p>${resetUrl}</p>
      <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      <hr/>
      <p style="color:#888;">Elyx - Plataforma condominal</p>
    `;

    this.mailService.sendEmail(correoNormalizado, 'Recuperacion de contrasena - Elyx', html).catch((err) => {
      console.error('[AUTH] Error enviando correo de recuperacion:', err?.message ?? err);
    });

    return { ok: true, message: 'Si el correo esta registrado, recibiras un enlace de recuperacion.' };
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

    return { ok: true, message: 'Contrasena actualizada correctamente. Ya puedes iniciar sesion.' };
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
