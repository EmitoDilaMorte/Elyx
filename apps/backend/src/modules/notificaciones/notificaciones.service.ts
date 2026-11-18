import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { conteoDe } from '../../common/db/resultado-query';
import { NotificacionesGateway } from './notificaciones.gateway';
import {
  CanalEntrega,
  CanalesNotificacion,
  ConfigNotificacionUsuario,
  CrearNotificacionInput,
  ListarNotificacionesInput,
  NotificacionRecord,
  PaginaNotificaciones,
  ResumenNotificaciones,
} from './notificaciones.types';

/**
 * Lo unico que se necesita de `DataSource`/`EntityManager`: permite usarlo
 * tambien desde servicios que reciben un manager minimo tipado.
 */
export type QueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown>;
};

const PAGINA_DEFAULT = 20;
const PAGINA_MAX = 100;

/**
 * Notificaciones de usuario.
 *
 * La tabla `notificaciones` es la BANDEJA: una fila por usuario. Cada fila
 * puede tener entregas por correo y push en `notificacion_entregas`, con su
 * propio estado e intentos. Esa separacion es lo que permite que un fallo de
 * Resend no tumbe la notificacion interna ni el push.
 *
 * Este servicio NO envia nada: al crear, deja las entregas en `PENDIENTE` y el
 * `NotificacionesDespachadorService` las procesa cada minuto.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  async listar(input: ListarNotificacionesInput): Promise<PaginaNotificaciones> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(PAGINA_MAX, Math.max(1, Math.floor(input.pageSize ?? PAGINA_DEFAULT)));
    const offset = (page - 1) * pageSize;
    const soloNoLeidas = Boolean(input.soloNoLeidas);

    const filas = await this.dataSource.query(
      `
      SELECT
        n.id_notificacion,
        uc.id_condominio,
        n.id_usuario_condominio,
        n.tipo,
        n.canal,
        n.asunto,
        n.mensaje,
        n.fecha_programada,
        n.fecha_envio,
        n.leida_en,
        n.estado,
        n.id_config,
        COALESCE(array_agg(e.canal ORDER BY e.canal) FILTER (WHERE e.canal IS NOT NULL), '{}') AS canales,
        COALESCE(array_agg(e.estado ORDER BY e.canal) FILTER (WHERE e.canal IS NOT NULL), '{}') AS entrega_estados,
        COALESCE(array_agg(e.ultimo_error ORDER BY e.canal) FILTER (WHERE e.canal IS NOT NULL), '{}') AS entrega_errores
      FROM notificaciones n
      INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = n.id_usuario_condominio
      LEFT JOIN notificacion_entregas e ON e.id_notificacion = n.id_notificacion
      WHERE n.id_usuario_condominio = $1
        AND n.visible_en_bandeja = TRUE
        AND ($2::boolean = FALSE OR n.estado <> 'LEIDA')
      GROUP BY n.id_notificacion, uc.id_condominio
      ORDER BY n.fecha_programada DESC
      LIMIT $3 OFFSET $4
      `,
      [input.idUsuarioCondominio, soloNoLeidas, pageSize, offset],
    );

    const conteo = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notificaciones
      WHERE id_usuario_condominio = $1
        AND visible_en_bandeja = TRUE
        AND ($2::boolean = FALSE OR estado <> 'LEIDA')
      `,
      [input.idUsuarioCondominio, soloNoLeidas],
    );

    const totalFila = Array.isArray(conteo) ? (conteo[0] as Record<string, unknown> | undefined) : undefined;
    const total = totalFila ? Number(totalFila.total) : 0;

    return {
      items: this.normalizeQueryRows(filas).map((row) => this.toRecord(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Numero de no leidas y las ultimas diez: lo que pinta la campana. */
  async resumen(idUsuarioCondominio: number): Promise<ResumenNotificaciones> {
    const conteo = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS total
      FROM notificaciones
      WHERE id_usuario_condominio = $1
        AND visible_en_bandeja = TRUE
        AND estado <> 'LEIDA'
      `,
      [idUsuarioCondominio],
    );

    const totalFila = Array.isArray(conteo) ? (conteo[0] as Record<string, unknown> | undefined) : undefined;
    const noLeidas = totalFila ? Number(totalFila.total) : 0;

    const filas = await this.dataSource.query(
      `
      SELECT
        n.id_notificacion,
        uc.id_condominio,
        n.id_usuario_condominio,
        n.tipo,
        n.canal,
        n.asunto,
        n.mensaje,
        n.fecha_programada,
        n.fecha_envio,
        n.leida_en,
        n.estado,
        n.id_config,
        COALESCE(array_agg(e.canal ORDER BY e.canal) FILTER (WHERE e.canal IS NOT NULL), '{}') AS canales,
        COALESCE(array_agg(e.estado ORDER BY e.canal) FILTER (WHERE e.canal IS NOT NULL), '{}') AS entrega_estados,
        COALESCE(array_agg(e.ultimo_error ORDER BY e.canal) FILTER (WHERE e.canal IS NOT NULL), '{}') AS entrega_errores
      FROM notificaciones n
      INNER JOIN usuarios_condominios uc ON uc.id_usuario_condominio = n.id_usuario_condominio
      LEFT JOIN notificacion_entregas e ON e.id_notificacion = n.id_notificacion
      WHERE n.id_usuario_condominio = $1
        AND n.visible_en_bandeja = TRUE
      GROUP BY n.id_notificacion, uc.id_condominio
      ORDER BY n.fecha_programada DESC
      LIMIT 10
      `,
      [idUsuarioCondominio],
    );

    return {
      noLeidas,
      items: this.normalizeQueryRows(filas).map((row) => this.toRecord(row)),
    };
  }

  // -------------------------------------------------------------------------
  // Creacion
  // -------------------------------------------------------------------------

  /** Crea una notificacion para un usuario. Envuelve todo en su transaccion. */
  async crear(input: CrearNotificacionInput): Promise<NotificacionRecord> {
    // El endpoint manual lo usa un administrador: hay que comprobar que el
    // destinatario pertenece al condominio indicado, o se podrian inyectar
    // notificaciones en la cuenta de alguien de otro condominio.
    const pertenencia = await this.dataSource.query(
      `
      SELECT 1
      FROM usuarios_condominios
      WHERE id_usuario_condominio = $1 AND id_condominio = $2
      LIMIT 1
      `,
      [input.idUsuarioCondominio, input.idCondominio],
    );

    if (!Array.isArray(pertenencia) || pertenencia.length === 0) {
      throw new NotFoundException('El usuario no pertenece al condominio indicado.');
    }

    return this.dataSource.transaction(async (manager) => {
      const [creada] = await this.crearEnTransaccion(manager, [input]);
      if (!creada) {
        throw new NotFoundException(
          'La notificacion no se genero: el usuario no pertenece al condominio o las tiene desactivadas.',
        );
      }
      return creada;
    });
  }

  /**
   * Crea varias notificaciones dentro de una transaccion ya abierta.
   *
   * Se usa desde los modulos que ya estan dentro de una transaccion (cobros,
   * altas, invitaciones). Devuelve solo las creadas: un usuario con las
   * notificaciones desactivadas no genera fila.
   */
  async crearEnTransaccion(
    manager: QueryManager,
    inputs: CrearNotificacionInput[],
  ): Promise<NotificacionRecord[]> {
    if (inputs.length === 0) {
      return [];
    }

    const ids = Array.from(new Set(inputs.map((item) => item.idUsuarioCondominio)));
    const configs = await this.cargarConfig(manager, ids);
    const creadas: NotificacionRecord[] = [];

    for (const input of inputs) {
      const config = configs.get(input.idUsuarioCondominio) ?? this.configPorDefecto();
      const creada = await this.insertar(manager, input, config);
      if (creada) {
        creadas.push(creada);
      }
    }

    return creadas;
  }

  /** Notificacion para varios usuarios del mismo condominio. */
  async crearParaUsuarios(
    idCondominio: number,
    idsUsuarioCondominio: number[],
    input: Omit<CrearNotificacionInput, 'idCondominio' | 'idUsuarioCondominio'>,
    manager?: QueryManager,
  ): Promise<NotificacionRecord[]> {
    const ejecutor = manager ?? this.dataSource;

    return this.crearEnTransaccion(
      ejecutor,
      idsUsuarioCondominio.map((idUsuarioCondominio) => ({
        ...input,
        idCondominio,
        idUsuarioCondominio,
      })),
    );
  }

  /** Notificacion para todos los administradores activos del condominio. */
  async crearParaAdmins(
    idCondominio: number,
    input: Omit<CrearNotificacionInput, 'idCondominio' | 'idUsuarioCondominio'>,
    manager?: QueryManager,
  ): Promise<NotificacionRecord[]> {
    const ejecutor = manager ?? this.dataSource;
    const ids = await this.idsAdmins(ejecutor, idCondominio);

    if (ids.length === 0) {
      return [];
    }

    return this.crearParaUsuarios(idCondominio, ids, input, ejecutor);
  }

  /** Notificacion para todos los miembros activos del condominio. */
  async crearParaCondominio(
    idCondominio: number,
    input: Omit<CrearNotificacionInput, 'idCondominio' | 'idUsuarioCondominio'>,
    manager?: QueryManager,
  ): Promise<NotificacionRecord[]> {
    const ejecutor = manager ?? this.dataSource;
    const ids = await this.idsCondominio(ejecutor, idCondominio);

    if (ids.length === 0) {
      return [];
    }

    return this.crearParaUsuarios(idCondominio, ids, input, ejecutor);
  }

  // -------------------------------------------------------------------------
  // Lectura de estados
  // -------------------------------------------------------------------------

  async marcarLeida(idNotificacion: number, idUsuarioCondominio: number): Promise<NotificacionRecord> {
    const rows = await this.dataSource.query(
      `
      UPDATE notificaciones n
      SET estado = 'LEIDA',
          leida_en = COALESCE(n.leida_en, NOW())
      WHERE n.id_notificacion = $1
        AND n.id_usuario_condominio = $2
      RETURNING
        n.id_notificacion,
        n.tipo,
        n.canal,
        n.asunto,
        n.mensaje,
        n.fecha_programada,
        n.fecha_envio,
        n.leida_en,
        n.estado,
        n.id_usuario_condominio,
        n.id_config,
        (SELECT uc.id_condominio FROM usuarios_condominios uc
          WHERE uc.id_usuario_condominio = n.id_usuario_condominio) AS id_condominio
      `,
      [idNotificacion, idUsuarioCondominio],
    );

    const normalizadas = this.normalizeQueryRows(rows);
    if (normalizadas.length === 0) {
      throw new NotFoundException('No se encontro la notificacion para el usuario indicado.');
    }

    const actualizada = this.toRecord(normalizadas[0]);

    this.notificacionesGateway.emitNotificacionChanged(
      actualizada.idCondominio,
      actualizada.idUsuarioCondominio,
      { tipo: 'LEIDA', notificacion: actualizada },
    );

    return actualizada;
  }

  /** Marca todas como leidas. Devuelve cuantas cambiaron. */
  async marcarTodasLeidas(idUsuarioCondominio: number): Promise<number> {
    const rows = await this.dataSource.query(
      `
      UPDATE notificaciones
      SET estado = 'LEIDA', leida_en = COALESCE(leida_en, NOW())
      WHERE id_usuario_condominio = $1
        AND estado <> 'LEIDA'
        AND visible_en_bandeja = TRUE
      RETURNING id_notificacion
      `,
      [idUsuarioCondominio],
    );

    return conteoDe(rows);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private async insertar(
    manager: QueryManager,
    input: CrearNotificacionInput,
    config: ConfigNotificacionUsuario,
  ): Promise<NotificacionRecord | null> {
    // `activo = false` desactiva TODA notificacion del usuario. Los correos de
    // seguridad (recuperacion, MFA) no pasan por aqui, asi que nunca se
    // bloquean.
    if (!config.activo) {
      return null;
    }

    const canales = this.resolverCanales(config, input.canales);
    if (!canales.interna && !canales.email && !canales.push) {
      return null;
    }

    const fecha = input.fechaProgramada ? new Date(input.fechaProgramada) : new Date();
    if (Number.isNaN(fecha.getTime())) {
      throw new NotFoundException('La fechaProgramada no es valida.');
    }

    const inmediata = fecha.getTime() <= Date.now();
    const asunto = input.asunto.trim().slice(0, 150);
    const mensaje = input.mensaje.trim();

    const rows = await manager.query(
      `
      INSERT INTO notificaciones (
        tipo,
        canal,
        asunto,
        mensaje,
        fecha_programada,
        fecha_envio,
        estado,
        leida_en,
        visible_en_bandeja,
        clave_dedupe,
        id_usuario_condominio,
        id_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11)
      ON CONFLICT (clave_dedupe) WHERE clave_dedupe IS NOT NULL DO NOTHING
      RETURNING
        id_notificacion,
        tipo,
        canal,
        asunto,
        mensaje,
        fecha_programada,
        fecha_envio,
        leida_en,
        estado,
        visible_en_bandeja,
        id_usuario_condominio,
        id_config
      `,
      [
        input.tipo,
        canales.interna ? 'INTERNA' : 'EMAIL',
        asunto,
        mensaje,
        fecha.toISOString(),
        inmediata ? new Date().toISOString() : null,
        inmediata ? 'ENVIADA' : 'PROGRAMADA',
        canales.interna,
        input.claveDedupe ?? null,
        input.idUsuarioCondominio,
        input.idConfig ?? config.idConfig,
      ],
    );

    const normalizadas = this.normalizeQueryRows(rows);
    if (normalizadas.length === 0) {
      // Ya existia una notificacion con la misma `clave_dedupe`.
      return null;
    }

    const fila = normalizadas[0] as Record<string, unknown>;
    const idNotificacion = Number(fila.id_notificacion);

    const canalesEntrega: CanalEntrega[] = [];
    if (canales.email) {
      canalesEntrega.push('EMAIL');
    }
    if (canales.push) {
      canalesEntrega.push('PUSH');
    }

    if (canalesEntrega.length > 0) {
      await manager.query(
        `
        INSERT INTO notificacion_entregas (id_notificacion, canal, estado, proximo_intento_en)
        SELECT $1, c.canal, 'PENDIENTE', $2::timestamptz
        FROM unnest($3::text[]) AS c(canal)
        ON CONFLICT (id_notificacion, canal) DO NOTHING
        `,
        [idNotificacion, fecha.toISOString(), canalesEntrega],
      );
    }

    const creada: NotificacionRecord = {
      ...this.toRecord(fila),
      idCondominio: input.idCondominio,
      canales: canalesEntrega,
      entregas: canalesEntrega.map((canal) => ({ canal, estado: 'PENDIENTE' as const, error: null })),
    };

    // Solo se avisa por socket lo que ya se puede leer en la bandeja. Las
    // programadas se emiten cuando el despachador las promueve.
    if (inmediata && canales.interna) {
      this.notificacionesGateway.emitNotificacionChanged(
        creada.idCondominio,
        creada.idUsuarioCondominio,
        { tipo: 'CREADA', notificacion: creada },
      );
    }

    return creada;
  }

  private resolverCanales(
    config: ConfigNotificacionUsuario,
    sobrescritura?: CanalesNotificacion,
  ): { interna: boolean; email: boolean; push: boolean } {
    return {
      interna: sobrescritura?.interna ?? config.interna,
      email: sobrescritura?.email ?? config.email,
      push: sobrescritura?.push ?? config.push,
    };
  }

  private async cargarConfig(
    manager: QueryManager,
    ids: number[],
  ): Promise<Map<number, ConfigNotificacionUsuario>> {
    const mapa = new Map<number, ConfigNotificacionUsuario>();
    if (ids.length === 0) {
      return mapa;
    }

    const rows = await manager.query(
      `
      SELECT
        uc.id_usuario_condominio,
        c.id_config,
        COALESCE(c.activo, TRUE) AS activo,
        COALESCE(c.usar_interna, TRUE) AS interna,
        COALESCE(c.usar_email, TRUE) AS email,
        COALESCE(c.usar_push, TRUE) AS push
      FROM usuarios_condominios uc
      LEFT JOIN config_notificaciones c
        ON c.id_usuario_condominio = uc.id_usuario_condominio
      WHERE uc.id_usuario_condominio = ANY($1::int[])
      `,
      [ids],
    );

    for (const fila of this.normalizeQueryRows(rows)) {
      mapa.set(Number(fila.id_usuario_condominio), {
        idConfig: fila.id_config ? Number(fila.id_config) : null,
        activo: Boolean(fila.activo),
        interna: Boolean(fila.interna),
        email: Boolean(fila.email),
        push: Boolean(fila.push),
      });
    }

    return mapa;
  }

  private configPorDefecto(): ConfigNotificacionUsuario {
    return { idConfig: null, activo: true, interna: true, email: true, push: true };
  }

  private async idsAdmins(manager: QueryManager, idCondominio: number): Promise<number[]> {
    const rows = await manager.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
      `,
      [idCondominio],
    );

    return this.normalizeQueryRows(rows)
      .map((fila) => Number(fila.id_usuario_condominio))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private async idsCondominio(manager: QueryManager, idCondominio: number): Promise<number[]> {
    const rows = await manager.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_condominio = $1 AND estado = 'ACTIVO'
      `,
      [idCondominio],
    );

    return this.normalizeQueryRows(rows)
      .map((fila) => Number(fila.id_usuario_condominio))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private toRecord(row: Record<string, unknown>): NotificacionRecord {
    const canales = Array.isArray(row.canales) ? (row.canales as unknown[]).map(String) : [];
    const estados = Array.isArray(row.entrega_estados)
      ? (row.entrega_estados as unknown[]).map(String)
      : [];
    const errores = Array.isArray(row.entrega_errores)
      ? (row.entrega_errores as unknown[])
      : [];

    return {
      idNotificacion: Number(row.id_notificacion),
      idCondominio: Number(row.id_condominio ?? 0),
      idUsuarioCondominio: Number(row.id_usuario_condominio),
      tipo: String(row.tipo),
      canal: String(row.canal),
      asunto: String(row.asunto),
      mensaje: String(row.mensaje),
      fechaProgramada: this.toIsoDate(row.fecha_programada),
      fechaEnvio: row.fecha_envio ? this.toIsoDate(row.fecha_envio) : null,
      leidaEn: row.leida_en ? this.toIsoDate(row.leida_en) : null,
      estado: String(row.estado) as NotificacionRecord['estado'],
      idConfig: row.id_config ? Number(row.id_config) : null,
      canales: canales as CanalEntrega[],
      entregas: canales.map((canal, indice) => ({
        canal: canal as CanalEntrega,
        estado: (estados[indice] ?? 'PENDIENTE') as NotificacionRecord['entregas'][number]['estado'],
        error: errores[indice] ? String(errores[indice]) : null,
      })),
    };
  }

  private normalizeQueryRows(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) {
      return [];
    }

    if (raw.length > 0 && Array.isArray(raw[0])) {
      return (raw[0] as Array<Record<string, unknown>>) ?? [];
    }

    return raw as Array<Record<string, unknown>>;
  }

  private toIsoDate(value: unknown): string {
    try {
      if (value instanceof Date) {
        if (!Number.isNaN(value.getTime())) {
          return value.toISOString();
        }
        return new Date().toISOString();
      }

      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }

      return new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}
