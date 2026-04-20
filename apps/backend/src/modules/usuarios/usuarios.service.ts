import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';

type QueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown[]>;
};

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
  unidadesCreadas: number;
  ocupacionesCreadas: number;
  cuotasInicialesCreadas: number;
  cuotaInicial: {
    montoCuotaInicial: number;
    diaLimitePago: number;
    recargoFijoPorDia: number;
    periodoAplicacionInicial: string;
    fechaInicioCobro: string;
  };
  advertenciaCuotas?: string;
};

type OnboardingPersonaInput = {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  correo: string;
};

type OnboardingCondominoInput = OnboardingPersonaInput & {
  claveUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
};

type OnboardingUnidadInput = {
  claveUnidad: string;
  tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
  correoOcupante?: string;
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

    const condominos: OnboardingCondominoInput[] = [
      {
        nombre: input.nombreCondomino,
        apellidoPaterno: input.apellidoPaternoCondomino,
        apellidoMaterno: input.apellidoMaternoCondomino,
        correo: input.correoCondomino,
        claveUnidad: input.claveUnidadCondomino,
        tipoUnidad: input.tipoUnidadCondomino,
      },
      ...(input.condominos ?? []),
    ];

    const adminUnique = this.uniqueByCorreo(admins);
    const condominoUnique = this.uniqueByCorreo(condominos);
    const unidadesCondominos = this.normalizeUnidadesCondominos(condominoUnique);
    const unidadesSinOcupante = this.normalizeUnidades(input.unidades ?? []);
    const unidades = this.mergeUnidades(unidadesCondominos, unidadesSinOcupante);
    const allEmails = [...adminUnique, ...condominoUnique].map((item) => item.correo.trim().toLowerCase());
    if (new Set(allEmails).size !== allEmails.length) {
      throw new BadRequestException('No se permiten correos repetidos entre admins y condominos.');
    }

    const fechaInicioCobro = this.parseFechaInicioCobro(input.fechaInicioCobro);
    const fechaLimiteCuota = this.buildFechaLimite(input.periodoAplicacionInicial, input.diaLimitePago);
    if (fechaLimiteCuota < fechaInicioCobro) {
      throw new BadRequestException('La fecha limite de pago no puede ser anterior a la fecha de inicio de cobro.');
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
        const usuario = await this.findOrCreateUsuario(manager, admin, 'ADMINISTRADOR');
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
        const usuario = await this.findOrCreateUsuario(manager, condomino, 'CONDOMINO');
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

      const condominoMap = new Map<string, number>();
      for (const condomino of condominosCreados) {
        condominoMap.set(condomino.correo, condomino.idUsuarioCondominio);
      }

      const { unidadesCreadas, ocupacionesCreadas } = await this.createUnidadesYAsignaciones(
        manager,
        idCondominio,
        fechaInicioCobro,
        unidades,
        condominoMap,
      );

      const cuotasInicialesCreadas = await this.createCuotasIniciales(
        manager,
        idCondominio,
        input.periodoAplicacionInicial,
        input.montoCuotaInicial,
        input.recargoFijoPorDia,
        input.diaLimitePago,
      );

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
        unidadesCreadas,
        ocupacionesCreadas,
        cuotasInicialesCreadas,
        cuotaInicial: {
          montoCuotaInicial: input.montoCuotaInicial,
          diaLimitePago: input.diaLimitePago,
          recargoFijoPorDia: input.recargoFijoPorDia,
          periodoAplicacionInicial: input.periodoAplicacionInicial,
          fechaInicioCobro: fechaInicioCobro.toISOString(),
        },
        advertenciaCuotas:
          cuotasInicialesCreadas === 0
            ? 'No se generaron cuotas iniciales porque el condominio no tiene unidades activas al momento del alta.'
            : undefined,
      };
    });
  }

  private normalizeUnidades(unidades: OnboardingUnidadInput[]): OnboardingUnidadInput[] {
    const normalized: OnboardingUnidadInput[] = [];

    for (const unidad of unidades) {
      const claveUnidad = String(unidad.claveUnidad).trim();
      const tipoUnidad = String(unidad.tipoUnidad).trim() as OnboardingUnidadInput['tipoUnidad'];

      if (!claveUnidad) {
        continue;
      }

      if (!['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'].includes(tipoUnidad)) {
        throw new BadRequestException(`Tipo de unidad invalido para ${claveUnidad}.`);
      }

      normalized.push({
        claveUnidad,
        tipoUnidad,
      });
    }

    return normalized;
  }

  private normalizeUnidadesCondominos(condominos: OnboardingCondominoInput[]): OnboardingUnidadInput[] {
    const normalized: OnboardingUnidadInput[] = [];

    for (const condomino of condominos) {
      const claveUnidad = String(condomino.claveUnidad ?? '').trim();
      const tipoUnidad = String(condomino.tipoUnidad ?? '').trim() as OnboardingUnidadInput['tipoUnidad'];

      if (!claveUnidad) {
        throw new BadRequestException(
          `No se permite crear condominos sin unidad. Falta asignar unidad para: ${condomino.correo}.`,
        );
      }

      if (!['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'].includes(tipoUnidad)) {
        throw new BadRequestException(`Tipo de unidad invalido para ${claveUnidad}.`);
      }

      normalized.push({
        claveUnidad,
        tipoUnidad,
        correoOcupante: condomino.correo,
      });
    }

    return normalized;
  }

  private mergeUnidades(
    unidadesAsignadas: OnboardingUnidadInput[],
    unidadesSinOcupante: OnboardingUnidadInput[],
  ): OnboardingUnidadInput[] {
    const all = [...unidadesAsignadas, ...unidadesSinOcupante];
    const seenClaves = new Set<string>();

    for (const unidad of all) {
      const clave = unidad.claveUnidad.toLowerCase();
      if (seenClaves.has(clave)) {
        throw new BadRequestException(`No se permiten claves de unidad repetidas: ${unidad.claveUnidad}`);
      }
      seenClaves.add(clave);
    }

    return all;
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

  private uniqueByCorreo<T extends { correo: string }>(items: T[]): T[] {
    const result: T[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const correo = item.correo.trim().toLowerCase();
      if (!correo || seen.has(correo)) {
        continue;
      }
      seen.add(correo);
      result.push({
        ...item,
        correo,
      });
    }

    return result;
  }

  private async findOrCreateUsuario(
    manager: QueryManager,
    persona: OnboardingPersonaInput,
    rolObjetivo: 'ADMINISTRADOR' | 'CONDOMINO',
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

      if (rolObjetivo === 'CONDOMINO') {
        const adminRows = await manager.query(
          `
          SELECT 1
          FROM usuarios_condominios
          WHERE id_usuario = $1 AND rol = 'ADMINISTRADOR'
          LIMIT 1
          `,
          [idUsuario],
        );

        if (adminRows.length > 0) {
          throw new BadRequestException(
            'Este correo ya esta registrado como administrador. Las cuentas de administrador solo pueden usarse como administrador.',
          );
        }
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
    manager: QueryManager,
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

  private parseFechaInicioCobro(rawDate: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
    if (!match) {
      throw new BadRequestException('La fecha de inicio de cobro no es valida.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const fechaInicio = new Date(year, month - 1, day);
    if (
      Number.isNaN(fechaInicio.getTime()) ||
      fechaInicio.getFullYear() !== year ||
      fechaInicio.getMonth() !== month - 1 ||
      fechaInicio.getDate() !== day
    ) {
      throw new BadRequestException('La fecha de inicio de cobro no es valida.');
    }

    const hoy = new Date();
    const hoyDate = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (fechaInicio < hoyDate) {
      throw new BadRequestException('La fecha de inicio de cobro no puede ser pasada.');
    }

    return fechaInicio;
  }

  private buildFechaLimite(periodoAplicacionInicial: string, diaLimitePago: number): Date {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodoAplicacionInicial);
    if (!match) {
      throw new BadRequestException('El periodo de aplicacion inicial debe tener formato YYYY-MM.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    return new Date(year, month - 1, diaLimitePago);
  }

  private async createCuotasIniciales(
    manager: QueryManager,
    idCondominio: number,
    periodoAplicacionInicial: string,
    montoCuotaInicial: number,
    recargoFijoPorDia: number,
    diaLimitePago: number,
  ): Promise<number> {
    const fechaLimite = this.buildFechaLimite(periodoAplicacionInicial, diaLimitePago)
      .toISOString()
      .slice(0, 10);

    const unidadesRows = await manager.query(
      `
      SELECT id_unidad
      FROM unidades
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      `,
      [idCondominio],
    );

    if (unidadesRows.length === 0) {
      return 0;
    }

    let createdCount = 0;
    for (const row of unidadesRows as Array<Record<string, unknown>>) {
      const idUnidad = Number(row.id_unidad);
      if (!Number.isInteger(idUnidad)) {
        continue;
      }

      const insertRows = await manager.query(
        `
        INSERT INTO cuotas (periodo, monto_base, fecha_limite, recargo_por_dia, estado, id_condominio, id_unidad)
        VALUES ($1, $2, $3, $4, 'PENDIENTE', $5, $6)
        ON CONFLICT (id_unidad, periodo)
        DO NOTHING
        RETURNING id_cuota
        `,
        [
          periodoAplicacionInicial,
          montoCuotaInicial,
          fechaLimite,
          recargoFijoPorDia,
          idCondominio,
          idUnidad,
        ],
      );

      if (insertRows.length > 0) {
        createdCount += 1;
      }
    }

    return createdCount;
  }

  private async createUnidadesYAsignaciones(
    manager: QueryManager,
    idCondominio: number,
    fechaInicioCobro: Date,
    unidades: OnboardingUnidadInput[],
    condominoMap: Map<string, number>,
  ): Promise<{ unidadesCreadas: number; ocupacionesCreadas: number }> {
    let unidadesCreadas = 0;
    let ocupacionesCreadas = 0;
    const fechaInicio = fechaInicioCobro.toISOString().slice(0, 10);

    for (const unidad of unidades) {
      const createdRows = await manager.query(
        `
        INSERT INTO unidades (clave_unidad, tipo_unidad, estado, id_condominio)
        VALUES ($1, $2, 'ACTIVA', $3)
        RETURNING id_unidad
        `,
        [unidad.claveUnidad, unidad.tipoUnidad, idCondominio],
      );

      const idUnidad = Number((createdRows[0] as Record<string, unknown>)?.id_unidad);
      if (!Number.isInteger(idUnidad)) {
        throw new BadRequestException(`No fue posible crear la unidad ${unidad.claveUnidad}.`);
      }

      unidadesCreadas += 1;

      if (!unidad.correoOcupante) {
        continue;
      }

      const idUsuarioCondominio = condominoMap.get(unidad.correoOcupante);
      if (!idUsuarioCondominio) {
        throw new BadRequestException(
          `No fue posible asignar la unidad ${unidad.claveUnidad} al correo ${unidad.correoOcupante}.`,
        );
      }

      await manager.query(
        `
        INSERT INTO unidades_ocupantes (tipo_ocupacion, fecha_inicio, fecha_fin, id_usuario_condominio, id_unidad)
        VALUES ('PROPIETARIO', $1, NULL, $2, $3)
        `,
        [fechaInicio, idUsuarioCondominio, idUnidad],
      );

      ocupacionesCreadas += 1;
    }

    return { unidadesCreadas, ocupacionesCreadas };
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
