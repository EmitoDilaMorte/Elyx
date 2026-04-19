import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';

type OnboardingResponse = {
  idCondominio: number;
  idUsuarioAdmin: number;
  idUsuarioCondomino: number;
  idUsuarioCondominioAdmin: number;
  idUsuarioCondominioCondomino: number;
  passwordTemporalAdmin: string | null;
  passwordTemporalCondomino: string | null;
  adminsCreados: Array<{
    idUsuario: number;
    idUsuarioCondominio: number;
    correo: string;
    passwordTemporal: string | null;
    reutilizado: boolean;
  }>;
  condominosCreados: Array<{
    idUsuario: number;
    idUsuarioCondominio: number;
    correo: string;
    passwordTemporal: string | null;
    reutilizado: boolean;
  }>;
};

type OnboardingPersonaInput = {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  correo: string;
};

type SuperCondominioRecord = {
  idCondominio: number;
  nombre: string;
  direccion: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
  fechaAlta: string;
  totalAdmins: number;
  totalCondominos: number;
  totalUsuarios: number;
};

@Injectable()
export class UsuariosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  async createOnboardingInicial(input: CreateOnboardingDto): Promise<OnboardingResponse> {
    const admins: OnboardingPersonaInput[] = [
      {
        nombre: input.nombreAdmin,
        apellidoPaterno: input.apellidoPaternoAdmin,
        apellidoMaterno: input.apellidoMaternoAdmin,
        correo: input.correoAdmin,
      },
      ...(input.admins ?? []),
    ];

    const condominos: OnboardingPersonaInput[] = [
      {
        nombre: input.nombreCondomino,
        apellidoPaterno: input.apellidoPaternoCondomino,
        apellidoMaterno: input.apellidoMaternoCondomino,
        correo: input.correoCondomino,
      },
      ...(input.condominos ?? []),
    ];

    const adminUnique = this.uniqueByCorreo(admins);
    const condominoUnique = this.uniqueByCorreo(condominos);
    const allEmails = [...adminUnique, ...condominoUnique].map((item) => item.correo.trim().toLowerCase());
    if (new Set(allEmails).size !== allEmails.length) {
      throw new BadRequestException('No se permiten correos repetidos entre admins y condominos.');
    }

    return this.dataSource.transaction(async (manager) => {
      const condominioRows = await manager.query(
        `
        INSERT INTO condominios (nombre, direccion, estado)
        VALUES ($1, $2, 'ACTIVO')
        RETURNING id_condominio
        `,
        [input.nombreCondominio.trim(), input.direccionCondominio?.trim() ?? null],
      );

      const idCondominio = Number(condominioRows[0]?.id_condominio);
      if (!Number.isInteger(idCondominio)) {
        throw new BadRequestException('No fue posible crear el condominio.');
      }

      const adminsCreados: OnboardingResponse['adminsCreados'] = [];
      const condominosCreados: OnboardingResponse['condominosCreados'] = [];

      for (const admin of adminUnique) {
        const usuario = await this.findOrCreateUsuario(manager, admin);
        const idUsuarioCondominio = await this.ensureMembresia(
          manager,
          usuario.idUsuario,
          idCondominio,
          'ADMINISTRADOR',
        );

        adminsCreados.push({
          idUsuario: usuario.idUsuario,
          idUsuarioCondominio,
          correo: admin.correo.trim().toLowerCase(),
          passwordTemporal: usuario.passwordTemporal,
          reutilizado: usuario.reutilizado,
        });
      }

      for (const condomino of condominoUnique) {
        const usuario = await this.findOrCreateUsuario(manager, condomino);
        const idUsuarioCondominio = await this.ensureMembresia(
          manager,
          usuario.idUsuario,
          idCondominio,
          'CONDOMINO',
        );

        condominosCreados.push({
          idUsuario: usuario.idUsuario,
          idUsuarioCondominio,
          correo: condomino.correo.trim().toLowerCase(),
          passwordTemporal: usuario.passwordTemporal,
          reutilizado: usuario.reutilizado,
        });
      }

      const primerAdmin = adminsCreados[0];
      const primerCondomino = condominosCreados[0];
      if (!primerAdmin || !primerCondomino) {
        throw new BadRequestException('No fue posible crear los usuarios iniciales.');
      }

      for (const admin of adminsCreados) {
        await manager.query(
          `
          INSERT INTO notificaciones (
            tipo,
            canal,
            asunto,
            mensaje,
            fecha_programada,
            fecha_envio,
            estado,
            id_usuario_condominio,
            id_config
          )
          VALUES ('ALTA_INICIAL_USUARIO', 'INTERNA', $1, $2, NOW(), NOW(), 'ENVIADA', $3, NULL)
          `,
          [
            'Acceso inicial creado',
            admin.reutilizado
              ? 'Ya tenias cuenta en Elyx. Se agrego tu acceso como administrador en este condominio.'
              : 'Tu cuenta de administrador fue creada con password temporal. Debes cambiarla en tu primer acceso.',
            admin.idUsuarioCondominio,
          ],
        );

        this.notificacionesGateway.emitNotificacionChanged(idCondominio, admin.idUsuarioCondominio, {
          tipo: 'ALTA_INICIAL_USUARIO',
        });
      }

      for (const condomino of condominosCreados) {
        await manager.query(
          `
          INSERT INTO notificaciones (
            tipo,
            canal,
            asunto,
            mensaje,
            fecha_programada,
            fecha_envio,
            estado,
            id_usuario_condominio,
            id_config
          )
          VALUES ('ALTA_INICIAL_USUARIO', 'INTERNA', $1, $2, NOW(), NOW(), 'ENVIADA', $3, NULL)
          `,
          [
            'Acceso inicial creado',
            condomino.reutilizado
              ? 'Ya tenias cuenta en Elyx. Se agrego tu acceso como condomino en este condominio.'
              : 'Tu cuenta de condomino fue creada con password temporal. Debes cambiarla en tu primer acceso.',
            condomino.idUsuarioCondominio,
          ],
        );

        this.notificacionesGateway.emitNotificacionChanged(idCondominio, condomino.idUsuarioCondominio, {
          tipo: 'ALTA_INICIAL_USUARIO',
        });
      }

      return {
        idCondominio,
        idUsuarioAdmin: primerAdmin.idUsuario,
        idUsuarioCondomino: primerCondomino.idUsuario,
        idUsuarioCondominioAdmin: primerAdmin.idUsuarioCondominio,
        idUsuarioCondominioCondomino: primerCondomino.idUsuarioCondominio,
        passwordTemporalAdmin: primerAdmin.passwordTemporal,
        passwordTemporalCondomino: primerCondomino.passwordTemporal,
        adminsCreados,
        condominosCreados,
      };
    });
  }

  async listSuperCondominios(): Promise<SuperCondominioRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_condominio AS "idCondominio",
        c.nombre AS "nombre",
        c.direccion AS "direccion",
        c.estado AS "estado",
        c.fecha_alta AS "fechaAlta",
        COUNT(CASE WHEN uc.rol = 'ADMINISTRADOR' THEN 1 END) AS "totalAdmins",
        COUNT(CASE WHEN uc.rol = 'CONDOMINO' THEN 1 END) AS "totalCondominos",
        COUNT(uc.id_usuario_condominio) AS "totalUsuarios"
      FROM condominios c
      LEFT JOIN usuarios_condominios uc ON uc.id_condominio = c.id_condominio
      GROUP BY c.id_condominio
      ORDER BY c.id_condominio DESC
      `,
    );

    return rows.map((row: Record<string, unknown>) => ({
      idCondominio: Number(row.idCondominio),
      nombre: String(row.nombre),
      direccion: row.direccion ? String(row.direccion) : null,
      estado: String(row.estado) === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
      fechaAlta: this.safeIsoDate(row.fechaAlta),
      totalAdmins: Number(row.totalAdmins),
      totalCondominos: Number(row.totalCondominos),
      totalUsuarios: Number(row.totalUsuarios),
    }));
  }

  async updateCondominioEstado(idCondominio: number, estado: 'ACTIVO' | 'INACTIVO'): Promise<SuperCondominioRecord> {
    await this.dataSource.query(
      `
      UPDATE condominios
      SET estado = $2
      WHERE id_condominio = $1
      `,
      [idCondominio, estado],
    );

    const rows = await this.dataSource.query(
      `
      SELECT
        c.id_condominio AS "idCondominio",
        c.nombre AS "nombre",
        c.direccion AS "direccion",
        c.estado AS "estado",
        c.fecha_alta AS "fechaAlta",
        COUNT(CASE WHEN uc.rol = 'ADMINISTRADOR' THEN 1 END) AS "totalAdmins",
        COUNT(CASE WHEN uc.rol = 'CONDOMINO' THEN 1 END) AS "totalCondominos",
        COUNT(uc.id_usuario_condominio) AS "totalUsuarios"
      FROM condominios c
      LEFT JOIN usuarios_condominios uc ON uc.id_condominio = c.id_condominio
      WHERE c.id_condominio = $1
      GROUP BY c.id_condominio
      LIMIT 1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new BadRequestException('No existe el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    return {
      idCondominio: Number(row.idCondominio),
      nombre: String(row.nombre),
      direccion: row.direccion ? String(row.direccion) : null,
      estado: String(row.estado) === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
      fechaAlta: this.safeIsoDate(row.fechaAlta),
      totalAdmins: Number(row.totalAdmins ?? 0),
      totalCondominos: Number(row.totalCondominos ?? 0),
      totalUsuarios: Number(row.totalUsuarios ?? 0),
    };
  }

  private safeIsoDate(value: unknown): string {
    const dateValue = value instanceof Date ? value : new Date(String(value ?? ''));
    if (Number.isNaN(dateValue.getTime())) {
      return new Date().toISOString();
    }
    return dateValue.toISOString();
  }

  private uniqueByCorreo(items: OnboardingPersonaInput[]) {
    const result: OnboardingPersonaInput[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const correo = item.correo.trim().toLowerCase();
      if (!correo || seen.has(correo)) {
        continue;
      }
      seen.add(correo);
      result.push({
        nombre: item.nombre,
        apellidoPaterno: item.apellidoPaterno,
        apellidoMaterno: item.apellidoMaterno,
        correo,
      });
    }

    return result;
  }

  private async findOrCreateUsuario(
    manager: { query: (query: string, parameters?: unknown[]) => Promise<unknown[]> },
    persona: OnboardingPersonaInput,
  ): Promise<{ idUsuario: number; passwordTemporal: string | null; reutilizado: boolean }> {
    const correo = persona.correo.trim().toLowerCase();
    const existingRows = await manager.query(
      `
      SELECT id_usuario
      FROM usuarios
      WHERE LOWER(correo) = $1
      LIMIT 1
      `,
      [correo],
    );

    if (existingRows.length > 0) {
      const idUsuario = Number((existingRows[0] as Record<string, unknown>).id_usuario);
      if (!Number.isInteger(idUsuario)) {
        throw new BadRequestException('No fue posible reutilizar el usuario existente.');
      }
      return {
        idUsuario,
        passwordTemporal: null,
        reutilizado: true,
      };
    }

    const passwordTemporal = this.generateTemporalPassword();
    const hash = await bcrypt.hash(passwordTemporal, 10);

    const createdRows = await manager.query(
      `
      INSERT INTO usuarios (
        nombre,
        primer_apellido,
        segundo_apellido,
        correo,
        password_hash,
        es_superusuario,
        requiere_cambio_password
      )
      VALUES ($1, $2, $3, $4, $5, FALSE, TRUE)
      RETURNING id_usuario
      `,
      [
        persona.nombre.trim(),
        persona.apellidoPaterno.trim(),
        persona.apellidoMaterno?.trim() ?? null,
        correo,
        hash,
      ],
    );

    const idUsuario = Number((createdRows[0] as Record<string, unknown>)?.id_usuario);
    if (!Number.isInteger(idUsuario)) {
      throw new BadRequestException('No fue posible crear los usuarios iniciales.');
    }

    return {
      idUsuario,
      passwordTemporal,
      reutilizado: false,
    };
  }

  private async ensureMembresia(
    manager: { query: (query: string, parameters?: unknown[]) => Promise<unknown[]> },
    idUsuario: number,
    idCondominio: number,
    rol: 'ADMINISTRADOR' | 'CONDOMINO',
  ): Promise<number> {
    const rows = await manager.query(
      `
      INSERT INTO usuarios_condominios (rol, estado, id_usuario, id_condominio)
      VALUES ($1, 'ACTIVO', $2, $3)
      ON CONFLICT (id_usuario, id_condominio)
      DO UPDATE SET rol = EXCLUDED.rol, estado = 'ACTIVO'
      RETURNING id_usuario_condominio
      `,
      [rol, idUsuario, idCondominio],
    );

    const idUsuarioCondominio = Number((rows[0] as Record<string, unknown>)?.id_usuario_condominio);
    if (!Number.isInteger(idUsuarioCondominio)) {
      throw new BadRequestException('No fue posible crear o actualizar la membresia del usuario.');
    }
    return idUsuarioCondominio;
  }

  private generateTemporalPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#*';
    let out = 'Elyx!';
    for (let i = 0; i < 8; i += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
}
