import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';

export type RefreshTokenEmitido = {
  idUsuario: number;
  token: string;
  expira: Date;
  familia: string;
};

type RefreshTokenRow = {
  id_usuario: number;
  familia: string;
  expira: string | Date;
  revocado: boolean;
};

type RequestMeta = {
  ip?: string;
  userAgent?: string;
};

/**
 * Refresh tokens opacos con rotacion y deteccion de reuso.
 *
 * En la base solo vive el SHA-256 del token: una fuga de la tabla no permite
 * reutilizar sesiones. Si un token ya revocado se vuelve a presentar, se
 * revoca la familia completa (posible robo).
 */
@Injectable()
export class RefreshTokensService {
  constructor(private readonly dataSource: DataSource) {}

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private diasVigencia(): number {
    const dias = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);
    return Number.isFinite(dias) && dias > 0 ? dias : 7;
  }

  /**
   * Vigencia de un refresh token que no se recuerda entre visitas: cubre la
   * jornada de trabajo pero muere al cerrar el navegador (cookie de sesion).
   */
  private horasVigenciaSesion(): number {
    const horas = Number(process.env.REFRESH_TOKEN_TTL_SESSION_HOURS ?? 12);
    return Number.isFinite(horas) && horas > 0 ? horas : 12;
  }

  async emitir(
    idUsuario: number,
    meta: RequestMeta = {},
    familia?: string,
    recordar = true,
  ): Promise<RefreshTokenEmitido> {
    const token = crypto.randomBytes(32).toString('base64url');
    const familiaFinal = familia ?? crypto.randomUUID();
    const vigenciaMs = recordar
      ? this.diasVigencia() * 24 * 60 * 60 * 1000
      : this.horasVigenciaSesion() * 60 * 60 * 1000;
    const expira = new Date(Date.now() + vigenciaMs);

    await this.dataSource.query(
      `
      INSERT INTO refresh_tokens (id_usuario, token_hash, familia, expira, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        idUsuario,
        this.hash(token),
        familiaFinal,
        expira.toISOString(),
        meta.ip ?? null,
        (meta.userAgent ?? '').slice(0, 255) || null,
      ],
    );

    return { idUsuario, token, expira, familia: familiaFinal };
  }

  /**
   * Valida y rota el token. Devuelve uno nuevo en la misma familia y conserva
   * la preferencia de "recordarme" con la que se creo la familia.
   */
  async rotar(token: string, meta: RequestMeta = {}): Promise<RefreshTokenEmitido> {
    const rows = (await this.dataSource.query(
      `
      SELECT id_usuario, familia, expira, revocado,
        COALESCE(
          (SELECT MAX(r2.expira) FROM refresh_tokens r2 WHERE r2.familia = refresh_tokens.familia),
          expira
        ) AS expira_familia
      FROM refresh_tokens
      WHERE token_hash = $1
      LIMIT 1
      `,
      [this.hash(token)],
    )) as Array<RefreshTokenRow & { expira_familia: Date | string }>;

    if (rows.length === 0) {
      throw new UnauthorizedException('Sesion expirada. Inicia sesion de nuevo.');
    }

    const row = rows[0];

    if (row.revocado) {
      // Reuso de un token ya rotado: se asume robo y se corta toda la familia.
      await this.revocarFamilia(row.familia);
      throw new UnauthorizedException('Sesion revocada. Inicia sesion de nuevo.');
    }

    if (new Date(row.expira) < new Date()) {
      await this.revocarFamilia(row.familia);
      throw new UnauthorizedException('Sesion expirada. Inicia sesion de nuevo.');
    }

    await this.dataSource.query(
      `
      UPDATE refresh_tokens
      SET revocado = TRUE, revocado_en = CURRENT_TIMESTAMP
      WHERE token_hash = $1
      `,
      [this.hash(token)],
    );

    return this.emitir(Number(row.id_usuario), meta, row.familia, this.recuerdaFamilia(row));
  }

  /**
   * Una familia "recordada" dura mas de un dia; la de sesion caduca el mismo
   * dia, asi que su expiracion mas lejana no supera el umbral diario.
   */
  private recuerdaFamilia(row: RefreshTokenRow & { expira_familia?: Date | string }): boolean {
    const referencia = row.expira_familia ?? row.expira;
    const ms = new Date(referencia).getTime() - Date.now();
    return Number.isFinite(ms) && ms > 24 * 60 * 60 * 1000;
  }

  async revocar(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await this.dataSource.query(
      `
      UPDATE refresh_tokens
      SET revocado = TRUE, revocado_en = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND revocado = FALSE
      `,
      [this.hash(token)],
    );
  }

  async revocarFamilia(familia: string): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE refresh_tokens
      SET revocado = TRUE, revocado_en = CURRENT_TIMESTAMP
      WHERE familia = $1 AND revocado = FALSE
      `,
      [familia],
    );
  }
}
