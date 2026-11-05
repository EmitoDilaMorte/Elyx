import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';

/** Minimal surface de EntityManager que necesita este servicio. */
export type QueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown[]>;
};

export type TipoUnidad = 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
export type RolMembresia = 'ADMINISTRADOR' | 'CONDOMINO';

export const TIPOS_UNIDAD: TipoUnidad[] = ['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'];

export type PersonaAlta = {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string | null;
  correo: string;
  /**
   * Hash ya calculado (registro publico: el usuario elige su password).
   * Si se omite se genera un password temporal y se exige cambiarlo.
   */
  passwordHash?: string | null;
};

export type UnidadAlta = {
  claveUnidad: string;
  tipoUnidad: TipoUnidad;
  correoOcupante?: string | null;
};

export type NuevaCuotaInicial = {
  periodo: string;
  monto: number;
  recargoPorDia: number;
  diaLimite: number;
};

export type NuevoCondominio = {
  nombre: string;
  direccion?: string | null;
  estado?: 'PENDIENTE_VERIFICACION' | 'PENDIENTE_PAGO' | 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';
  cupoUnidades?: number | null;
};

/**
 * Logica de alta compartida entre el onboarding del superusuario, el registro
 * publico ("Crea tu condominio") y la aprobacion de invitaciones.
 *
 * Todo el trabajo de este servicio ocurre dentro de una transaccion abierta por
 * quien lo llama: recibe el `manager`, no el `DataSource`.
 */
@Injectable()
export class CondominioAltaService {
  constructor(private readonly notificacionesGateway: NotificacionesGateway) {}

  async crearCondominio(manager: QueryManager, input: NuevoCondominio): Promise<number> {
    const rows = await manager.query(
      `
      INSERT INTO condominios (nombre, direccion, estado, cupo_unidades)
      VALUES ($1, $2, $3, $4)
      RETURNING id_condominio
      `,
      [
        input.nombre.trim(),
        input.direccion?.trim() || null,
        input.estado ?? 'ACTIVO',
        input.cupoUnidades ?? null,
      ],
    );

    const idCondominio = Number((rows[0] as Record<string, unknown>)?.id_condominio);
    if (!Number.isInteger(idCondominio) || idCondominio <= 0) {
      throw new BadRequestException('No fue posible crear el condominio.');
    }
    return idCondominio;
  }

  /**
   * Reutiliza el usuario si el correo ya existe.
   *
   * Ya NO se bloquea que una cuenta de administrador reciba el rol de condomino
   * (y viceversa): una misma persona puede ser ambas cosas en el mismo
   * condominio usando una sola cuenta.
   */
  async findOrCreateUsuario(
    manager: QueryManager,
    persona: PersonaAlta,
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
      if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        throw new BadRequestException('No fue posible reutilizar el usuario existente.');
      }
      return { idUsuario, passwordTemporal: null, reutilizado: true };
    }

    const tienePasswordPropio = Boolean(persona.passwordHash);
    const passwordTemporal = tienePasswordPropio ? null : this.generarPasswordTemporal();
    const hash = persona.passwordHash
      ? persona.passwordHash
      : await bcrypt.hash(passwordTemporal as string, 10);
    const requiereCambio = !tienePasswordPropio;

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
      VALUES ($1, $2, $3, $4, $5, FALSE, $6)
      RETURNING id_usuario
      `,
      [
        persona.nombre.trim(),
        persona.apellidoPaterno.trim(),
        persona.apellidoMaterno?.trim() || null,
        correo,
        hash,
        requiereCambio,
      ],
    );

    const idUsuario = Number((createdRows[0] as Record<string, unknown>)?.id_usuario);
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      throw new BadRequestException('No fue posible crear el usuario.');
    }

    return {
      idUsuario,
      passwordTemporal: requiereCambio ? passwordTemporal : null,
      reutilizado: false,
    };
  }

  /**
   * Crea o recupera la membresia SIN degradar el rol existente.
   *
   * El `ON CONFLICT ... DO UPDATE SET rol = EXCLUDED.rol` anterior convertia a
   * un ADMINISTRADOR en CONDOMINO cuando se procesaba una alta con su correo.
   * Ahora solo se asciende a ADMINISTRADOR, nunca se desciende.
   */
  async ensureMembresia(
    manager: QueryManager,
    idUsuario: number,
    idCondominio: number,
    rol: RolMembresia,
  ): Promise<number> {
    const insertedRows = await manager.query(
      `
      INSERT INTO usuarios_condominios (rol, estado, id_usuario, id_condominio)
      VALUES ($1, 'ACTIVO', $2, $3)
      ON CONFLICT (id_usuario, id_condominio) DO NOTHING
      RETURNING id_usuario_condominio, rol
      `,
      [rol, idUsuario, idCondominio],
    );

    if (insertedRows.length > 0) {
      const idUsuarioCondominio = Number(
        (insertedRows[0] as Record<string, unknown>)?.id_usuario_condominio,
      );
      if (!Number.isInteger(idUsuarioCondominio) || idUsuarioCondominio <= 0) {
        throw new BadRequestException('No fue posible crear la membresia del usuario.');
      }
      return idUsuarioCondominio;
    }

    const existingRows = await manager.query(
      `
      SELECT id_usuario_condominio, rol, estado
      FROM usuarios_condominios
      WHERE id_usuario = $1 AND id_condominio = $2
      LIMIT 1
      FOR UPDATE
      `,
      [idUsuario, idCondominio],
    );

    const existing = existingRows[0] as Record<string, unknown> | undefined;
    const idUsuarioCondominio = Number(existing?.id_usuario_condominio);
    if (!Number.isInteger(idUsuarioCondominio) || idUsuarioCondominio <= 0) {
      throw new BadRequestException('No fue posible crear o actualizar la membresia del usuario.');
    }

    const rolActual = String(existing?.rol ?? '');
    const estadoActual = String(existing?.estado ?? '');

    // Solo se asciende: un admin nunca se convierte en condomino por un alta.
    if (rol === 'ADMINISTRADOR' && rolActual !== 'ADMINISTRADOR') {
      await manager.query(
        `UPDATE usuarios_condominios SET rol = 'ADMINISTRADOR', estado = 'ACTIVO' WHERE id_usuario_condominio = $1`,
        [idUsuarioCondominio],
      );
    } else if (estadoActual !== 'ACTIVO') {
      await manager.query(
        `UPDATE usuarios_condominios SET estado = 'ACTIVO' WHERE id_usuario_condominio = $1`,
        [idUsuarioCondominio],
      );
    }

    return idUsuarioCondominio;
  }

  async crearUnidades(
    manager: QueryManager,
    idCondominio: number,
    unidades: UnidadAlta[],
  ): Promise<Array<{ idUnidad: number; claveUnidad: string }>> {
    const creadas: Array<{ idUnidad: number; claveUnidad: string }> = [];

    for (const unidad of unidades) {
      const claveUnidad = unidad.claveUnidad.trim();
      if (!claveUnidad) {
        continue;
      }
      if (!TIPOS_UNIDAD.includes(unidad.tipoUnidad)) {
        throw new BadRequestException(`Tipo de unidad invalido para ${claveUnidad}.`);
      }

      const rows = await manager.query(
        `
        INSERT INTO unidades (clave_unidad, tipo_unidad, estado, id_condominio)
        VALUES ($1, $2, 'ACTIVA', $3)
        RETURNING id_unidad
        `,
        [claveUnidad, unidad.tipoUnidad, idCondominio],
      );

      const idUnidad = Number((rows[0] as Record<string, unknown>)?.id_unidad);
      if (!Number.isInteger(idUnidad) || idUnidad <= 0) {
        throw new BadRequestException(`No fue posible crear la unidad ${claveUnidad}.`);
      }

      creadas.push({ idUnidad, claveUnidad });
    }

    return creadas;
  }

  /** Genera claves correlativas: prefijo 'Depto ' + 1..30 => 'Depto 1' ... */
  generarUnidadesDesdePatron(
    prefijo: string,
    cantidad: number,
    tipoUnidad: TipoUnidad,
    inicio = 1,
  ): UnidadAlta[] {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException('El numero de unidades debe ser un entero mayor a cero.');
    }

    // El prefijo se conserva tal cual (incluido el espacio final de "Depto "),
    // porque es parte de como el administrador nombra sus unidades.
    const base = prefijo.trim().length > 0 ? prefijo : '';
    const unidades: UnidadAlta[] = [];
    for (let i = 0; i < cantidad; i += 1) {
      const claveUnidad = `${base}${inicio + i}`;
      if (claveUnidad.length > 30) {
        throw new BadRequestException(
          `La clave de unidad "${claveUnidad}" excede los 30 caracteres. Usa un prefijo mas corto.`,
        );
      }
      unidades.push({ claveUnidad, tipoUnidad });
    }

    return unidades;
  }

  async asignarOcupante(
    manager: QueryManager,
    idUnidad: number,
    idUsuarioCondominio: number,
    tipoOcupacion: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE',
    fechaInicio: string,
  ): Promise<void> {
    await manager.query(
      `
      INSERT INTO unidades_ocupantes (tipo_ocupacion, fecha_inicio, fecha_fin, id_usuario_condominio, id_unidad)
      VALUES ($1, $2, NULL, $3, $4)
      `,
      [tipoOcupacion, fechaInicio, idUsuarioCondominio, idUnidad],
    );

    // Estado de cuenta inicial por unidad (no rompe si ya existe).
    await manager.query(
      `
      INSERT INTO estado_cuenta (saldo_actual, total_adeudo, recargos_estimados, fecha_corte, id_unidad)
      VALUES (0, 0, 0, CURRENT_DATE, $1)
      ON CONFLICT (id_unidad) DO NOTHING
      `,
      [idUnidad],
    );
  }

  async crearCuotasIniciales(
    manager: QueryManager,
    idCondominio: number,
    cuota: NuevaCuotaInicial,
  ): Promise<number> {
    const fechaLimite = this.buildFechaLimite(cuota.periodo, cuota.diaLimite)
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
          cuota.periodo,
          cuota.monto,
          fechaLimite,
          cuota.recargoPorDia,
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

  /** Inserta la notificacion interna y avisa por websocket. */
  async notificarAlta(
    manager: QueryManager,
    input: {
      idCondominio: number;
      idUsuarioCondominio: number;
      asunto: string;
      mensaje: string;
      tipo?: string;
    },
  ): Promise<void> {
    const tipo = input.tipo ?? 'ALTA_INICIAL_USUARIO';

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
      VALUES ($1, 'INTERNA', $2, $3, NOW(), NOW(), 'ENVIADA', $4, NULL)
      `,
      [tipo, input.asunto, input.mensaje, input.idUsuarioCondominio],
    );

    this.notificacionesGateway.emitNotificacionChanged(
      input.idCondominio,
      input.idUsuarioCondominio,
      { tipo },
    );
  }

  buildFechaLimite(periodoAplicacionInicial: string, diaLimitePago: number): Date {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodoAplicacionInicial);
    if (!match) {
      throw new BadRequestException('El periodo de aplicacion inicial debe tener formato YYYY-MM.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    return new Date(year, month - 1, diaLimitePago);
  }

  generarPasswordTemporal(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#*';
    let out = 'Elyx!';
    for (let i = 0; i < 8; i += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  async hashearPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
