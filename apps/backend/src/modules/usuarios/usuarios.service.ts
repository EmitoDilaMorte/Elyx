import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CondominioAltaService, QueryManager } from '../condominio-alta/condominio-alta.service';
import { MembresiasService } from '../membresias/membresias.service';
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

type MembresiaRecord = {
  idUsuarioCondominio: number;
  idUsuario: number;
  correo: string;
  nombre: string;
  rol: 'ADMINISTRADOR' | 'CONDOMINO';
  estado: string;
  unidades: string[];
};

@Injectable()
export class UsuariosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly alta: CondominioAltaService,
    private readonly membresias: MembresiasService,
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
    const fechaLimiteCuota = this.alta.buildFechaLimite(
      input.periodoAplicacionInicial,
      input.diaLimitePago,
    );
    if (fechaLimiteCuota < fechaInicioCobro) {
      throw new BadRequestException('La fecha limite de pago no puede ser anterior a la fecha de inicio de cobro.');
    }

    return this.dataSource.transaction(async (manager) => {
      // El superusuario no queda limitado por licencia: cupo_unidades = NULL.
      const idCondominio = await this.alta.crearCondominio(manager, {
        nombre: input.nombreCondominio,
        direccion: input.direccionCondominio,
        estado: 'ACTIVO',
        cupoUnidades: null,
      });

      const adminsCreados: OnboardingResponse['adminsCreados'] = [];
      const condominosCreados: OnboardingResponse['condominosCreados'] = [];

      for (const admin of adminUnique) {
        const usuario = await this.alta.findOrCreateUsuario(manager, admin);
        const idUsuarioCondominio = await this.alta.ensureMembresia(
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
        const usuario = await this.alta.findOrCreateUsuario(manager, condomino);
        const idUsuarioCondominio = await this.alta.ensureMembresia(
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

      const cuotasInicialesCreadas = await this.alta.crearCuotasIniciales(manager, idCondominio, {
        periodo: input.periodoAplicacionInicial,
        monto: input.montoCuotaInicial,
        recargoPorDia: input.recargoFijoPorDia,
        diaLimite: input.diaLimitePago,
      });

      for (const admin of adminsCreados) {
        await this.alta.notificarAlta(manager, {
          idCondominio,
          idUsuarioCondominio: admin.idUsuarioCondominio,
          asunto: 'Acceso inicial creado',
          mensaje: admin.reutilizado
            ? 'Ya tenias cuenta en Elyx. Se agrego tu acceso como administrador en este condominio.'
            : 'Tu cuenta de administrador fue creada con password temporal. Debes cambiarla en tu primer acceso.',
        });
      }

      for (const condomino of condominosCreados) {
        await this.alta.notificarAlta(manager, {
          idCondominio,
          idUsuarioCondominio: condomino.idUsuarioCondominio,
          asunto: 'Acceso inicial creado',
          mensaje: condomino.reutilizado
            ? 'Ya tenias cuenta en Elyx. Se agrego tu acceso como condomino en este condominio.'
            : 'Tu cuenta de condomino fue creada con password temporal. Debes cambiarla en tu primer acceso.',
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
      estado: this.normalizarEstadoCondominio(row.estado),
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
      estado: this.normalizarEstadoCondominio(row.estado),
      fechaAlta: this.safeIsoDate(row.fechaAlta),
      totalAdmins: Number(row.totalAdmins ?? 0),
      totalCondominos: Number(row.totalCondominos ?? 0),
      totalUsuarios: Number(row.totalUsuarios ?? 0),
    };
  }

  /**
   * El listado del superusuario sigue exponiendo solo ACTIVO/INACTIVO: los
   * estados del ciclo de registro se presentan como INACTIVO hasta que el
   * condominio queda operativo.
   */
  private normalizarEstadoCondominio(value: unknown): 'ACTIVO' | 'INACTIVO' {
    return String(value ?? '') === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO';
  }

  async listMembresias(idCondominio: number): Promise<MembresiaRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        uc.id_usuario_condominio,
        uc.rol,
        uc.estado,
        u.id_usuario,
        u.correo,
        TRIM(CONCAT_WS(' ', u.nombre, u.primer_apellido, u.segundo_apellido)) AS nombre,
        (
          SELECT STRING_AGG(un.clave_unidad, ', ' ORDER BY un.clave_unidad)
          FROM unidades_ocupantes uo
          JOIN unidades un ON un.id_unidad = uo.id_unidad
          WHERE uo.id_usuario_condominio = uc.id_usuario_condominio
            AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
        ) AS unidades
      FROM usuarios_condominios uc
      JOIN usuarios u ON u.id_usuario = uc.id_usuario
      WHERE uc.id_condominio = $1
      ORDER BY uc.rol ASC, u.nombre ASC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => ({
      idUsuarioCondominio: Number(row.id_usuario_condominio),
      idUsuario: Number(row.id_usuario),
      correo: String(row.correo ?? ''),
      nombre: String(row.nombre ?? '').trim(),
      rol: String(row.rol ?? 'CONDOMINO') as 'ADMINISTRADOR' | 'CONDOMINO',
      estado: String(row.estado ?? 'ACTIVO'),
      unidades: row.unidades ? String(row.unidades).split(', ') : [],
    }));
  }

  /**
   * Cambia el rol de una membresia.
   *
   * Delega en `MembresiasService` para que la regla "nunca dejar el condominio
   * sin administradores" viva en un solo lugar y la comparta la votacion.
   */
  async updateMembresiaRol(
    idCondominio: number,
    idUsuarioCondominio: number,
    rol: 'ADMINISTRADOR' | 'CONDOMINO',
  ): Promise<MembresiaRecord[]> {
    await this.membresias.cambiarRol(idCondominio, idUsuarioCondominio, rol);
    return this.listMembresias(idCondominio);
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

  private async createUnidadesYAsignaciones(
    manager: QueryManager,
    idCondominio: number,
    fechaInicioCobro: Date,
    unidades: OnboardingUnidadInput[],
    condominoMap: Map<string, number>,
  ): Promise<{ unidadesCreadas: number; ocupacionesCreadas: number }> {
    const creadas = await this.alta.crearUnidades(
      manager,
      idCondominio,
      unidades.map((unidad) => ({
        claveUnidad: unidad.claveUnidad,
        tipoUnidad: unidad.tipoUnidad,
      })),
    );

    const fechaInicio = fechaInicioCobro.toISOString().slice(0, 10);
    let ocupacionesCreadas = 0;

    for (let index = 0; index < unidades.length; index += 1) {
      const unidad = unidades[index];
      if (!unidad.correoOcupante) {
        continue;
      }

      const idUsuarioCondominio = condominoMap.get(unidad.correoOcupante);
      if (!idUsuarioCondominio) {
        throw new BadRequestException(
          `No fue posible asignar la unidad ${unidad.claveUnidad} al correo ${unidad.correoOcupante}.`,
        );
      }

      await this.alta.asignarOcupante(
        manager,
        creadas[index].idUnidad,
        idUsuarioCondominio,
        'PROPIETARIO',
        fechaInicio,
      );

      ocupacionesCreadas += 1;
    }

    return { unidadesCreadas: creadas.length, ocupacionesCreadas };
  }
}
