import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/auth/role.enum';

type LoginMembership = {
  idUsuarioCondominio: number;
  idCondominio: number;
  rol: Role;
  estado: string;
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
        uc.estado
      FROM usuarios u
      LEFT JOIN usuarios_condominios uc ON uc.id_usuario = u.id_usuario
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
      requiereCambioPassword: Boolean(first.requiere_cambio_password),
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

    if (passwordActual === passwordNueva) {
      throw new BadRequestException('La nueva password debe ser distinta a la actual.');
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

  private async validatePassword(rawPassword: string, passwordHash: string): Promise<boolean> {
    if (passwordHash.startsWith('$2')) {
      return bcrypt.compare(rawPassword, passwordHash);
    }

    return rawPassword === passwordHash;
  }
}
