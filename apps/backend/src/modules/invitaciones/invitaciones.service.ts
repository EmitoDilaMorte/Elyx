import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CondominioAltaService } from '../condominio-alta/condominio-alta.service';
import { CupoService } from '../cupo/cupo.service';
import { MailService } from '../mail/mail.service';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import {
  CrearSolicitudInvitacionDto,
  ResolverSolicitudAltaDto,
} from './dto/invitaciones.dto';
import {
  EstadoInvitacion,
  InvitacionEstado,
  InvitacionPublica,
  SolicitudAltaRecord,
} from './invitaciones.types';

const MENSAJE_GENERICO =
  'Recibimos tus datos. Te enviamos un correo para confirmar tu direccion; en cuanto lo confirmes, el administrador revisara tu solicitud.';

/** Mensaje unico para cualquier fallo del enlace: no revela el motivo real. */
const ENLACE_NO_DISPONIBLE = 'Este enlace de invitacion ya no esta disponible.';

type InvitacionRow = Record<string, unknown>;

@Injectable()
export class InvitacionesService {
  private readonly logger = new Logger(InvitacionesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly alta: CondominioAltaService,
    private readonly cupo: CupoService,
    private readonly mailService: MailService,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  // -------------------------------------------------------------------------
  // Panel del administrador
  // -------------------------------------------------------------------------

  async estado(idCondominio: number): Promise<InvitacionEstado> {
    const resumen = await this.cupo.resumen(idCondominio);

    const rows = await this.dataSource.query(
      `
      SELECT id_invitacion, token_hash, estado, motivo_cierre, expiracion, creada_en
      FROM invitaciones_condominio
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      LIMIT 1
      `,
      [idCondominio],
    );

    const pendientes = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS total
      FROM solicitudes_alta_invitacion
      WHERE id_condominio = $1 AND estado IN ('PENDIENTE', 'VERIFICADA')
      `,
      [idCondominio],
    );

    const invitacion = rows.length > 0 ? (rows[0] as InvitacionRow) : null;

    let motivoBloqueo: string | null = null;
    if (resumen.unidadesLibres <= 0) {
      motivoBloqueo = 'No quedan unidades libres en el condominio.';
    } else if (!invitacion) {
      motivoBloqueo = 'Aun no has generado un enlace de invitacion.';
    }

    // El token en claro no se puede recuperar (solo se guarda el hash), asi que
    // la URL solo se entrega en la respuesta de creacion.
    return {
      invitacion: invitacion
        ? {
            idInvitacion: Number(invitacion.id_invitacion),
            estado: String(invitacion.estado) as EstadoInvitacion,
            motivoCierre: invitacion.motivo_cierre ? String(invitacion.motivo_cierre) : null,
            expiracion: new Date(String(invitacion.expiracion)).toISOString(),
            creadaEn: new Date(String(invitacion.creada_en)).toISOString(),
          }
        : null,
      url: null,
      cupo: {
        cupoTotal: resumen.cupoTotal,
        unidadesTotales: resumen.unidadesTotales,
        unidadesOcupadas: resumen.unidadesOcupadas,
        unidadesLibres: resumen.unidadesLibres,
      },
      puedeInvitar: resumen.unidadesLibres > 0,
      motivoBloqueo,
      solicitudesPendientes: Number(
        (pendientes[0] as Record<string, unknown>)?.total ?? 0,
      ),
    };
  }

  /**
   * Crea un enlace nuevo. El anterior se revoca (ROTADA) porque solo puede
   * existir uno ACTIVO por condominio (indice unico parcial).
   */
  async crearOrotar(
    idCondominio: number,
    idUsuarioCreador: number,
  ): Promise<{ url: string; expiracion: string; idInvitacion: number }> {
    await this.cupo.assertCondominioOperativo(idCondominio);

    const resumen = await this.cupo.resumen(idCondominio);
    if (resumen.unidadesLibres <= 0) {
      throw new BadRequestException(
        'No quedan unidades libres. El enlace se genera cuando hay asientos disponibles.',
      );
    }

    // El JWT trae `id_usuario`; la FK de `creada_por` apunta a la membresia.
    const idUsuarioCondominioCreador = await this.resolverMembresia(idCondominio, idUsuarioCreador);

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE invitaciones_condominio
        SET estado = 'REVOCADA', motivo_cierre = 'ROTADA', revocada_en = NOW()
        WHERE id_condominio = $1 AND estado = 'ACTIVA'
        `,
        [idCondominio],
      );

      const { token, tokenHash } = this.generarToken();
      const dias = this.diasExpiracion();
      const expiracion = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

      const rows = await manager.query(
        `
        INSERT INTO invitaciones_condominio (
          id_condominio, token_hash, estado, expiracion, creada_por
        )
        VALUES ($1, $2, 'ACTIVA', $3, $4)
        RETURNING id_invitacion
        `,
        [idCondominio, tokenHash, expiracion.toISOString(), idUsuarioCondominioCreador],
      );

      const idInvitacion = Number((rows[0] as Record<string, unknown>)?.id_invitacion);
      if (!Number.isInteger(idInvitacion)) {
        throw new BadRequestException('No fue posible generar el enlace de invitacion.');
      }

      return {
        idInvitacion,
        url: this.construirUrl(token),
        expiracion: expiracion.toISOString(),
      };
    });
  }

  async revocar(idCondominio: number, motivo = 'MANUAL'): Promise<InvitacionEstado> {
    await this.dataSource.query(
      `
      UPDATE invitaciones_condominio
      SET estado = 'REVOCADA', motivo_cierre = $2, revocada_en = NOW()
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      `,
      [idCondominio, motivo],
    );

    return this.estado(idCondominio);
  }

  async listarSolicitudes(
    idCondominio: number,
    estado?: string | null,
  ): Promise<SolicitudAltaRecord[]> {
    const estadosValidos = ['PENDIENTE', 'VERIFICADA', 'APROBADA', 'RECHAZADA', 'EXPIRADA'];
    const filtro = estado && estadosValidos.includes(estado) ? estado : null;

    const params: Array<number | string> = [idCondominio];
    let clausula = '';
    if (filtro) {
      params.push(filtro);
      clausula = ` AND s.estado = $${params.length}`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        s.*,
        un.clave_unidad
      FROM solicitudes_alta_invitacion s
      LEFT JOIN unidades un ON un.id_unidad = s.id_unidad_propuesta
      WHERE s.id_condominio = $1${clausula}
      ORDER BY
        CASE s.estado WHEN 'VERIFICADA' THEN 0 WHEN 'PENDIENTE' THEN 1 ELSE 2 END,
        s.fecha_solicitud DESC
      `,
      params,
    );

    return rows.map((row: InvitacionRow) => this.toSolicitud(row));
  }

  /**
   * Aprueba una solicitud verificada. Revalida cupo y unidad dentro de la
   * transaccion (con FOR UPDATE) para no sobrevender el ultimo asiento.
   */
  async aprobarSolicitud(
    input: ResolverSolicitudAltaDto,
    idUsuarioRevisor: number,
  ): Promise<SolicitudAltaRecord> {
    const idCondominio = await this.resolverCondominioDeSolicitud(input.idSolicitud);
    const idUsuarioCondominioAdmin = await this.resolverMembresia(idCondominio, idUsuarioRevisor);

    await this.cupo.assertCondominioOperativo(idCondominio);

    const resultado = await this.dataSource.transaction(async (manager) => {
      // Bloquea el condominio: serializa las aprobaciones concurrentes.
      await manager.query(`SELECT id_condominio FROM condominios WHERE id_condominio = $1 FOR UPDATE`, [
        idCondominio,
      ]);

      const rows = await manager.query(
        `
        SELECT * FROM solicitudes_alta_invitacion
        WHERE id_solicitud = $1 AND id_condominio = $2
        FOR UPDATE
        `,
        [input.idSolicitud, idCondominio],
      );

      if (rows.length === 0) {
        throw new NotFoundException('No se encontro la solicitud indicada.');
      }

      const solicitud = rows[0] as InvitacionRow;
      const estadoSolicitud = String(solicitud.estado ?? '');

      if (estadoSolicitud === 'APROBADA') {
        return { idSolicitud: Number(solicitud.id_solicitud), yaAprobada: true, sinAsientos: false };
      }

      if (estadoSolicitud !== 'VERIFICADA') {
        throw new BadRequestException(
          'Solo se pueden aprobar solicitudes con el correo ya verificado.',
        );
      }

      const idUnidad = Number(solicitud.id_unidad_propuesta);

      const unidadRows = await manager.query(
        `
        SELECT id_unidad FROM unidades
        WHERE id_unidad = $1 AND id_condominio = $2 AND estado = 'ACTIVA'
        FOR UPDATE
        `,
        [idUnidad, idCondominio],
      );

      if (unidadRows.length === 0) {
        throw new BadRequestException('La unidad solicitada ya no existe o no pertenece al condominio.');
      }

      const ocupada = await manager.query(
        `
        SELECT 1 FROM unidades_ocupantes
        WHERE id_unidad = $1 AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
        LIMIT 1
        `,
        [idUnidad],
      );

      if (ocupada.length > 0) {
        throw new BadRequestException('La unidad solicitada ya tiene un ocupante activo.');
      }

      const usuario = await this.alta.findOrCreateUsuario(manager, {
        nombre: String(solicitud.nombre ?? ''),
        apellidoPaterno: String(solicitud.apellido_paterno ?? ''),
        apellidoMaterno: solicitud.apellido_materno
          ? String(solicitud.apellido_materno)
          : null,
        correo: String(solicitud.correo ?? ''),
        passwordHash: solicitud.password_hash ? String(solicitud.password_hash) : null,
      });

      const idUsuarioCondominio = await this.alta.ensureMembresia(
        manager,
        usuario.idUsuario,
        idCondominio,
        'CONDOMINO',
      );

      await this.alta.asignarOcupante(
        manager,
        idUnidad,
        idUsuarioCondominio,
        (String(solicitud.tipo_ocupacion ?? 'PROPIETARIO') as
          | 'PROPIETARIO'
          | 'INQUILINO'
          | 'HABITANTE'),
        new Date().toISOString().slice(0, 10),
      );

      await manager.query(
        `
        UPDATE solicitudes_alta_invitacion
        SET estado = 'APROBADA', revisado_por = $2, fecha_resolucion = NOW()
        WHERE id_solicitud = $1
        `,
        [input.idSolicitud, idUsuarioCondominioAdmin],
      );

      await this.alta.notificarAlta(manager, {
        idCondominio,
        idUsuarioCondominio,
        asunto: 'Tu solicitud fue aprobada',
        mensaje:
          'Tu solicitud de alta fue aprobada. Ya tienes acceso al condominio y una unidad asignada.',
        tipo: 'SOLICITUD_ALTA_APROBADA',
      });

      // Si con esta aprobacion se agoto el cupo, el enlace se revoca.
      const libresRows = await manager.query(
        `
        SELECT COUNT(*)::int AS total
        FROM unidades u
        WHERE u.id_condominio = $1
          AND u.estado = 'ACTIVA'
          AND NOT EXISTS (
            SELECT 1 FROM unidades_ocupantes uo
            WHERE uo.id_unidad = u.id_unidad
              AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
          )
        `,
        [idCondominio],
      );

      const libres = Number((libresRows[0] as Record<string, unknown>)?.total ?? 0);

      if (libres <= 0) {
        await manager.query(
          `
          UPDATE invitaciones_condominio
          SET estado = 'REVOCADA', motivo_cierre = 'CUPO_AGOTADO', revocada_en = NOW()
          WHERE id_condominio = $1 AND estado = 'ACTIVA'
          `,
          [idCondominio],
        );

        const admins = await manager.query(
          `
          SELECT id_usuario_condominio FROM usuarios_condominios
          WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
          `,
          [idCondominio],
        );

        for (const admin of admins as Array<Record<string, unknown>>) {
          await this.alta.notificarAlta(manager, {
            idCondominio,
            idUsuarioCondominio: Number(admin.id_usuario_condominio),
            asunto: 'Cupo de invitaciones agotado',
            mensaje:
              'Se registraron todos los condominos previstos. El enlace de invitacion quedo desactivado.',
            tipo: 'INVITACION_AGOTADA',
          });
        }
      }

      return { idSolicitud: input.idSolicitud, yaAprobada: false, sinAsientos: libres <= 0 };
    });

    const actualizadas = await this.dataSource.query(
      `
      SELECT s.*, un.clave_unidad
      FROM solicitudes_alta_invitacion s
      LEFT JOIN unidades un ON un.id_unidad = s.id_unidad_propuesta
      WHERE s.id_solicitud = $1
      `,
      [resultado.idSolicitud],
    );

    return this.toSolicitud(actualizadas[0] as InvitacionRow);
  }

  async rechazarSolicitud(
    input: ResolverSolicitudAltaDto,
    idUsuarioRevisor: number,
  ): Promise<SolicitudAltaRecord> {
    const idCondominio = await this.resolverCondominioDeSolicitud(input.idSolicitud);
    const idUsuarioCondominioAdmin = await this.resolverMembresia(idCondominio, idUsuarioRevisor);

    const rows = await this.dataSource.query(
      `
      UPDATE solicitudes_alta_invitacion
      SET estado = 'RECHAZADA', motivo_rechazo = $3, revisado_por = $4, fecha_resolucion = NOW()
      WHERE id_solicitud = $1 AND id_condominio = $2 AND estado IN ('PENDIENTE', 'VERIFICADA')
      RETURNING *
      `,
      [input.idSolicitud, idCondominio, input.comentario?.trim() || null, idUsuarioCondominioAdmin],
    );

    if (rows.length === 0) {
      throw new BadRequestException('La solicitud ya fue resuelta o no existe.');
    }

    const actualizadas = await this.dataSource.query(
      `
      SELECT s.*, un.clave_unidad
      FROM solicitudes_alta_invitacion s
      LEFT JOIN unidades un ON un.id_unidad = s.id_unidad_propuesta
      WHERE s.id_solicitud = $1
      `,
      [input.idSolicitud],
    );

    return this.toSolicitud(actualizadas[0] as InvitacionRow);
  }

  // -------------------------------------------------------------------------
  // Flujo publico
  // -------------------------------------------------------------------------

  async obtenerPublica(rawToken: string): Promise<InvitacionPublica> {
    const invitacion = await this.resolverInvitacionActiva(rawToken);

    const idCondominio = Number(invitacion.id_condominio);

    const condominios = await this.dataSource.query(
      `SELECT nombre, direccion FROM condominios WHERE id_condominio = $1`,
      [idCondominio],
    );

    const unidades = await this.dataSource.query(
      `
      SELECT u.id_unidad, u.clave_unidad, u.tipo_unidad
      FROM unidades u
      WHERE u.id_condominio = $1
        AND u.estado = 'ACTIVA'
        AND NOT EXISTS (
          SELECT 1 FROM unidades_ocupantes uo
          WHERE uo.id_unidad = u.id_unidad
            AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
        )
        AND NOT EXISTS (
          SELECT 1 FROM solicitudes_alta_invitacion s
          WHERE s.id_unidad_propuesta = u.id_unidad
            AND s.estado IN ('PENDIENTE', 'VERIFICADA')
        )
      ORDER BY u.clave_unidad ASC
      `,
      [idCondominio],
    );

    const condominio = (condominios[0] ?? {}) as Record<string, unknown>;

    return {
      nombreCondominio: String(condominio.nombre ?? ''),
      direccionCondominio: condominio.direccion ? String(condominio.direccion) : null,
      expiracion: new Date(String(invitacion.expiracion)).toISOString(),
      unidadesLibres: unidades.map((row: Record<string, unknown>) => ({
        idUnidad: Number(row.id_unidad),
        claveUnidad: String(row.clave_unidad ?? ''),
        tipoUnidad: String(row.tipo_unidad ?? 'OTRO'),
      })),
    };
  }

  async crearSolicitud(
    rawToken: string,
    dto: CrearSolicitudInvitacionDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true; message: string }> {
    const invitacion = await this.resolverInvitacionActiva(rawToken);
    const idCondominio = Number(invitacion.id_condominio);

    await this.cupo.assertCondominioOperativo(idCondominio);

    if (!(await this.cupo.hayAsientosLibres(idCondominio))) {
      throw new BadRequestException(ENLACE_NO_DISPONIBLE);
    }

    const unidadRows = await this.dataSource.query(
      `
      SELECT id_unidad FROM unidades
      WHERE id_unidad = $1 AND id_condominio = $2 AND estado = 'ACTIVA'
      LIMIT 1
      `,
      [dto.idUnidad, idCondominio],
    );

    if (unidadRows.length === 0) {
      throw new BadRequestException(ENLACE_NO_DISPONIBLE);
    }

    const correo = dto.correo.trim().toLowerCase();

    const usuariosRows = await this.dataSource.query(
      `SELECT id_usuario FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1`,
      [correo],
    );
    const esCuentaExistente = usuariosRows.length > 0;

    // Cuenta nueva: el usuario elige su password. Cuenta existente: se ignora y
    // la propiedad del buzon se prueba con el enlace enviado por correo.
    const passwordHash =
      !esCuentaExistente && dto.password ? await bcrypt.hash(dto.password, 10) : null;

    const { token, tokenHash } = this.generarToken();
    const expiracion = new Date(Date.now() + 48 * 60 * 60 * 1000);

    try {
      await this.dataSource.query(
        `
        INSERT INTO solicitudes_alta_invitacion (
          id_condominio, id_invitacion, nombre, apellido_paterno, apellido_materno,
          correo, password_hash, es_cuenta_existente, telefono, id_unidad_propuesta,
          tipo_ocupacion, token_hash, expiracion, estado, ip, user_agent
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDIENTE',$14,$15)
        `,
        [
          idCondominio,
          Number(invitacion.id_invitacion),
          dto.nombre.trim(),
          dto.apellidoPaterno.trim(),
          dto.apellidoMaterno?.trim() || null,
          correo,
          passwordHash,
          esCuentaExistente,
          dto.telefono?.trim() || null,
          dto.idUnidad,
          dto.tipoOcupacion ?? 'PROPIETARIO',
          tokenHash,
          expiracion.toISOString(),
          meta.ip ?? null,
          meta.userAgent ?? null,
        ],
      );
    } catch (error) {
      // Los indices unicos parciales evitan duplicados de unidad o correo.
      this.logger.debug('Solicitud de invitacion rechazada por unicidad.', error as Error);
      throw new BadRequestException(
        'Ya existe una solicitud en curso para esa unidad o para ese correo. Revisa tu correo o contacta al administrador.',
      );
    }

    await this.avisarAdmins(idCondominio, 'SOLICITUD_ALTA_CREADA', {
      asunto: 'Nueva solicitud de alta',
      mensaje: `${dto.nombre} ${dto.apellidoPaterno} solicito unirse al condominio.`,
    });

    await this.enviarCorreoConfirmacion({
      correo,
      nombre: dto.nombre,
      nombreCondominio: String(invitacion.nombre_condominio ?? ''),
      token,
      esCuentaExistente,
    });

    return { ok: true, message: MENSAJE_GENERICO };
  }

  async confirmarSolicitud(rawToken: string): Promise<{
    ok: true;
    estado: string;
    nombreCondominio: string;
  }> {
    const tokenHash = this.hashear(rawToken);

    const resultado = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        SELECT * FROM solicitudes_alta_invitacion
        WHERE token_hash = $1
        FOR UPDATE
        `,
        [tokenHash],
      );

      if (rows.length === 0) {
        throw new NotFoundException('El enlace de confirmacion no es valido.');
      }

      const solicitud = rows[0] as InvitacionRow;
      const estado = String(solicitud.estado ?? '');

      if (estado === 'VERIFICADA' || estado === 'APROBADA') {
        return {
          idCondominio: Number(solicitud.id_condominio),
          estado,
        };
      }

      if (estado !== 'PENDIENTE') {
        throw new BadRequestException('Esta solicitud ya no puede confirmarse.');
      }

      if (new Date(String(solicitud.expiracion)).getTime() < Date.now()) {
        await manager.query(
          `UPDATE solicitudes_alta_invitacion SET estado = 'EXPIRADA' WHERE id_solicitud = $1`,
          [Number(solicitud.id_solicitud)],
        );
        throw new BadRequestException('El enlace de confirmacion expiro. Vuelve a enviar tu solicitud.');
      }

      await manager.query(
        `
        UPDATE solicitudes_alta_invitacion
        SET estado = 'VERIFICADA', verificado_en = NOW()
        WHERE id_solicitud = $1
        `,
        [Number(solicitud.id_solicitud)],
      );

      return { idCondominio: Number(solicitud.id_condominio), estado: 'VERIFICADA' };
    });

    await this.avisarAdmins(resultado.idCondominio, 'SOLICITUD_ALTA_VERIFICADA', {
      asunto: 'Solicitud lista para revisar',
      mensaje: 'Un condomino confirmo su correo y espera aprobacion.',
    });

    const condominios = await this.dataSource.query(
      `SELECT nombre FROM condominios WHERE id_condominio = $1`,
      [resultado.idCondominio],
    );

    return {
      ok: true,
      estado: resultado.estado,
      nombreCondominio: String((condominios[0] as Record<string, unknown>)?.nombre ?? ''),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async resolverInvitacionActiva(rawToken: string): Promise<InvitacionRow> {
    if (!rawToken || rawToken.length < 32) {
      throw new NotFoundException(ENLACE_NO_DISPONIBLE);
    }

    const rows = await this.dataSource.query(
      `
      SELECT i.*, c.nombre AS nombre_condominio, c.estado AS estado_condominio
      FROM invitaciones_condominio i
      JOIN condominios c ON c.id_condominio = i.id_condominio
      WHERE i.token_hash = $1
      LIMIT 1
      `,
      [this.hashear(rawToken)],
    );

    if (rows.length === 0) {
      throw new NotFoundException(ENLACE_NO_DISPONIBLE);
    }

    const invitacion = rows[0] as InvitacionRow;

    if (String(invitacion.estado) !== 'ACTIVA') {
      throw new BadRequestException(ENLACE_NO_DISPONIBLE);
    }

    if (new Date(String(invitacion.expiracion)).getTime() < Date.now()) {
      throw new BadRequestException(ENLACE_NO_DISPONIBLE);
    }

    return invitacion;
  }

  private async resolverCondominioDeSolicitud(idSolicitud: number): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT id_condominio FROM solicitudes_alta_invitacion WHERE id_solicitud = $1`,
      [idSolicitud],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la solicitud indicada.');
    }

    return Number((rows[0] as Record<string, unknown>).id_condominio);
  }

  /**
   * Traduce el `sub` del JWT (id_usuario) al id de la membresia en el
   * condominio. Las FK de auditoria apuntan a `usuarios_condominios`, no a
   * `usuarios`: usar el id del token directamente rompe la insercion.
   */
  private async resolverMembresia(idCondominio: number, idUsuario: number): Promise<number | null> {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return null;
    }

    const rows = await this.dataSource.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_usuario = $1 AND id_condominio = $2
      LIMIT 1
      `,
      [idUsuario, idCondominio],
    );

    if (rows.length === 0) {
      return null;
    }

    return Number((rows[0] as Record<string, unknown>).id_usuario_condominio);
  }

  private async avisarAdmins(
    idCondominio: number,
    tipo: string,
    mensaje: { asunto: string; mensaje: string },
  ): Promise<void> {
    const admins = await this.dataSource.query(
      `
      SELECT id_usuario_condominio FROM usuarios_condominios
      WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
      `,
      [idCondominio],
    );

    for (const admin of admins as Array<Record<string, unknown>>) {
      const idUsuarioCondominio = Number(admin.id_usuario_condominio);
      await this.dataSource.query(
        `
        INSERT INTO notificaciones (
          tipo, canal, asunto, mensaje, fecha_programada, fecha_envio, estado,
          id_usuario_condominio, id_config
        )
        VALUES ($1, 'INTERNA', $2, $3, NOW(), NOW(), 'ENVIADA', $4, NULL)
        `,
        [tipo, mensaje.asunto, mensaje.mensaje, idUsuarioCondominio],
      );

      this.notificacionesGateway.emitNotificacionChanged(idCondominio, idUsuarioCondominio, { tipo });
    }
  }

  private async enviarCorreoConfirmacion(input: {
    correo: string;
    nombre: string;
    nombreCondominio: string;
    token: string;
    esCuentaExistente: boolean;
  }): Promise<void> {
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .replace(/\/+$/, '');
    const url = `${base}/invitacion/confirmar?token=${input.token}`;

    const html = `
      <h2>Confirma tu correo - Elyx</h2>
      <p>Hola ${input.nombre},</p>
      <p>Recibimos tu solicitud para unirte a <strong>${input.nombreCondominio}</strong> en Elyx.</p>
      <p>Confirma tu correo para que el administrador pueda revisar tu solicitud (enlace valido 48 horas):</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Confirmar mi correo</a></p>
      <p>O copia este enlace en tu navegador:</p>
      <p>${url}</p>
      <p>Si no solicitaste esto, ignora este mensaje.</p>
      <hr/>
      <p style="color:#888;">Elyx - Plataforma condominal</p>
    `;

    const enviado = await this.mailService.sendEmail(
      input.correo,
      'Confirma tu correo para unirte al condominio - Elyx',
      html,
    );

    if (!enviado) {
      this.logger.warn(`No se pudo enviar la confirmacion a ${input.correo}`);
    }
  }

  private construirUrl(token: string): string {
    const base = (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
      .replace(/\/+$/, '');
    return `${base}/invitacion/${token}`;
  }

  private diasExpiracion(): number {
    const valor = Number(process.env.INVITACION_EXPIRACION_DIAS ?? 30);
    return Number.isFinite(valor) && valor > 0 ? valor : 30;
  }

  private generarToken(): { token: string; tokenHash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: this.hashear(token) };
  }

  private hashear(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private toSolicitud(row: InvitacionRow): SolicitudAltaRecord {
    return {
      idSolicitud: Number(row.id_solicitud),
      idCondominio: Number(row.id_condominio),
      nombre: String(row.nombre ?? ''),
      apellidoPaterno: String(row.apellido_paterno ?? ''),
      apellidoMaterno: row.apellido_materno ? String(row.apellido_materno) : null,
      correo: String(row.correo ?? ''),
      telefono: row.telefono ? String(row.telefono) : null,
      idUnidadPropuesta: Number(row.id_unidad_propuesta),
      claveUnidad: row.clave_unidad ? String(row.clave_unidad) : null,
      tipoOcupacion: String(row.tipo_ocupacion ?? 'PROPIETARIO'),
      estado: String(row.estado ?? 'PENDIENTE') as SolicitudAltaRecord['estado'],
      esCuentaExistente: Boolean(row.es_cuenta_existente),
      motivoRechazo: row.motivo_rechazo ? String(row.motivo_rechazo) : null,
      fechaSolicitud: new Date(String(row.fecha_solicitud)).toISOString(),
      fechaResolucion: row.fecha_resolucion
        ? new Date(String(row.fecha_resolucion)).toISOString()
        : null,
    };
  }
}
