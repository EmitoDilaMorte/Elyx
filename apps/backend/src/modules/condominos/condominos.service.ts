import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SolicitudCambioEstado } from '../../common/enums/solicitud-cambio-estado.enum';
import { SolicitudCambioTipo } from '../../common/enums/solicitud-cambio-tipo.enum';
import { NotificacionesGateway } from '../notificaciones/notificaciones.gateway';
import { CreateSolicitudCambioDto, ResolverSolicitudCambioDto } from './dto/create-solicitud-cambio.dto';

type SolicitudRecord = {
  idSolicitud: number;
  idCondominio: number;
  idUsuarioCondominioSolicitante: number;
  idUsuarioCondominioObjetivo: number;
  tipo: string;
  estado: string;
  motivo: string;
  detalle: Record<string, unknown> | null;
  idUsuarioCondominioAprobador: number | null;
  comentarioResolucion: string | null;
  fechaSolicitud: string;
  fechaResolucion: string | null;
  fechaEjecucion: string | null;
};

type SolicitudActor = {
  idUsuario: number;
  memberships: Array<{
    idUsuarioCondominio: number;
    idCondominio: number;
    rol: string;
  }>;
};

@Injectable()
export class CondominosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesGateway: NotificacionesGateway,
  ) {}

  async createSolicitud(input: CreateSolicitudCambioDto, actor: SolicitudActor): Promise<SolicitudRecord> {
    this.validateDetalleByTipo(input.tipo, input.detalle);

    if (!Number.isInteger(actor.idUsuario) || actor.idUsuario <= 0) {
      throw new BadRequestException('No fue posible identificar al usuario autenticado.');
    }

    if (input.idUsuarioCondominioSolicitante !== input.idUsuarioCondominioObjetivo) {
      throw new BadRequestException('El condomino solo puede crear solicitudes para su propio usuario-condominio.');
    }

    const membershipSolicitante = actor.memberships.find(
      (item) =>
        Number(item.idUsuarioCondominio) === input.idUsuarioCondominioSolicitante &&
        Number(item.idCondominio) === input.idCondominio,
    );

    if (!membershipSolicitante) {
      throw new BadRequestException('No tienes permisos para crear solicitud sobre ese condominio.');
    }

    if (String(membershipSolicitante.rol) !== 'CONDOMINO') {
      throw new BadRequestException('Solo un condomino puede crear solicitudes de baja o cambio personal.');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.assertMembershipInCondominio(
        manager,
        input.idCondominio,
        input.idUsuarioCondominioSolicitante,
        'El solicitante no pertenece al condominio indicado.',
      );
      await this.assertMembershipInCondominio(
        manager,
        input.idCondominio,
        input.idUsuarioCondominioObjetivo,
        'El condomino objetivo no pertenece al condominio indicado.',
      );

      const rawRows = await manager.query(
        `
        INSERT INTO solicitudes_cambio_condomino (
          id_condominio,
          id_usuario_condominio_solicitante,
          id_usuario_condominio_objetivo,
          tipo,
          estado,
          motivo,
          detalle,
          fecha_solicitud
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
        RETURNING *
        `,
        [
          input.idCondominio,
          input.idUsuarioCondominioSolicitante,
          input.idUsuarioCondominioObjetivo,
          input.tipo,
          SolicitudCambioEstado.PENDIENTE,
          input.motivo.trim(),
          JSON.stringify(input.detalle ?? null),
        ],
      );

      const rows = this.normalizeQueryRows(rawRows);
      if (rows.length === 0) {
        throw new BadRequestException('No fue posible crear la solicitud.');
      }

      const created = this.toRecord(rows[0]);
      await this.insertInternalNotification(
        manager,
        created.idUsuarioCondominioSolicitante,
        created.idCondominio,
        'SOLICITUD_CAMBIO_CREADA',
        'Solicitud creada',
        `Tu solicitud ${created.tipo} fue registrada y esta pendiente de aprobacion.`,
      );
      await this.insertInternalNotification(
        manager,
        created.idUsuarioCondominioObjetivo,
        created.idCondominio,
        'SOLICITUD_CAMBIO_CREADA',
        'Nueva solicitud sobre tu cuenta',
        `Se registro una solicitud ${created.tipo} que te involucra.`,
      );

      const adminDestinatarios = await this.getAdminsByCondominio(manager, created.idCondominio);
      for (const idAdmin of adminDestinatarios) {
        await this.insertInternalNotification(
          manager,
          idAdmin,
          created.idCondominio,
          'SOLICITUD_CAMBIO_CREADA',
          'Solicitud pendiente por revisar',
          `Se recibio una solicitud ${created.tipo}. Revisa la seccion de bajas y cambios para aprobar o rechazar.`,
        );
      }

      this.emitChanged(created, 'CREADA');
      return created;
    });
  }

  async listSolicitudes(idCondominio: number, estado?: string): Promise<SolicitudRecord[]> {
    const params: Array<string | number> = [idCondominio];
    let estadoClause = '';

    if (estado && estado.trim().length > 0) {
      params.push(estado.trim());
      estadoClause = ` AND estado = $${params.length}`;
    }

    const rawRows = await this.dataSource.query(
      `
      SELECT *
      FROM solicitudes_cambio_condomino
      WHERE id_condominio = $1${estadoClause}
      ORDER BY fecha_solicitud DESC
      `,
      params,
    );

    const rows = this.normalizeQueryRows(rawRows);

    return rows.map((row) => this.toRecord(row));
  }

  async aprobarSolicitud(input: ResolverSolicitudCambioDto): Promise<SolicitudRecord> {
    return this.updateEstado(input, SolicitudCambioEstado.APROBADA, 'SOLICITUD_CAMBIO_APROBADA', 'APROBADA');
  }

  async rechazarSolicitud(input: ResolverSolicitudCambioDto): Promise<SolicitudRecord> {
    return this.updateEstado(input, SolicitudCambioEstado.RECHAZADA, 'SOLICITUD_CAMBIO_RECHAZADA', 'RECHAZADA');
  }

  async ejecutarSolicitud(input: ResolverSolicitudCambioDto): Promise<SolicitudRecord> {
    return this.dataSource.transaction(async (manager) => {
      const solicitud = await this.getSolicitudForUpdate(manager, input.idCondominio, input.idSolicitud);
      if (solicitud.estado !== SolicitudCambioEstado.APROBADA) {
        throw new BadRequestException('Solo las solicitudes aprobadas pueden ejecutarse.');
      }

      await this.assertMembershipInCondominio(
        manager,
        input.idCondominio,
        input.idUsuarioCondominioAdmin,
        'El admin no pertenece al condominio indicado.',
      );

      await this.applyCambio(manager, solicitud);

      const rawRows = await manager.query(
        `
        UPDATE solicitudes_cambio_condomino
        SET
          estado = $1,
          id_usuario_condominio_aprobador = $2,
          comentario_resolucion = COALESCE($3, comentario_resolucion),
          fecha_ejecucion = NOW(),
          fecha_resolucion = COALESCE(fecha_resolucion, NOW())
        WHERE id_solicitud = $4
        RETURNING *
        `,
        [SolicitudCambioEstado.EJECUTADA, input.idUsuarioCondominioAdmin, input.comentario?.trim() ?? null, input.idSolicitud],
      );

      const rows = this.normalizeQueryRows(rawRows);
      if (rows.length === 0) {
        throw new NotFoundException('No se encontro la solicitud para ejecutar.');
      }

      const updated = this.toRecord(rows[0]);
      const destinatarios = await this.getDestinatariosSolicitud(manager, input.idSolicitud);

      await this.insertInternalNotification(
        manager,
        destinatarios.idSolicitante,
        updated.idCondominio,
        'SOLICITUD_CAMBIO_EJECUTADA',
        'Solicitud ejecutada',
        `La solicitud ${updated.tipo} ya fue ejecutada.`,
      );
      await this.insertInternalNotification(
        manager,
        destinatarios.idObjetivo,
        updated.idCondominio,
        'SOLICITUD_CAMBIO_EJECUTADA',
        'Cambio aplicado',
        `Se aplico el cambio solicitado de tipo ${updated.tipo}.`,
      );

      this.emitChanged(updated, 'EJECUTADA');
      return updated;
    });
  }

  private async updateEstado(
    input: ResolverSolicitudCambioDto,
    estado: SolicitudCambioEstado,
    tipoNotificacion: string,
    tipoEvento: string,
  ): Promise<SolicitudRecord> {
    return this.dataSource.transaction(async (manager) => {
      const solicitud = await this.getSolicitudForUpdate(manager, input.idCondominio, input.idSolicitud);
      if (solicitud.estado !== SolicitudCambioEstado.PENDIENTE) {
        throw new BadRequestException('Solo las solicitudes pendientes pueden resolverse.');
      }

      await this.assertMembershipInCondominio(
        manager,
        input.idCondominio,
        input.idUsuarioCondominioAdmin,
        'El admin no pertenece al condominio indicado.',
      );

      const rawRows = await manager.query(
        `
        UPDATE solicitudes_cambio_condomino
        SET
          estado = $1,
          id_usuario_condominio_aprobador = $2,
          comentario_resolucion = $3,
          fecha_resolucion = NOW()
        WHERE id_solicitud = $4
        RETURNING *
        `,
        [estado, input.idUsuarioCondominioAdmin, input.comentario?.trim() ?? null, input.idSolicitud],
      );

      const rows = this.normalizeQueryRows(rawRows);
      if (rows.length === 0) {
        throw new NotFoundException('No se encontro la solicitud para resolver.');
      }

      const updated = this.toRecord(rows[0]);
      const destinatarios = await this.getDestinatariosSolicitud(manager, input.idSolicitud);
      const mensaje =
        estado === SolicitudCambioEstado.APROBADA
          ? `Tu solicitud ${updated.tipo} fue aprobada.`
          : `Tu solicitud ${updated.tipo} fue rechazada.`;

      await this.insertInternalNotification(
        manager,
        destinatarios.idSolicitante,
        updated.idCondominio,
        tipoNotificacion,
        `Solicitud ${estado.toLowerCase()}`,
        mensaje,
      );

      this.emitChanged(updated, tipoEvento);
      return updated;
    });
  }

  private async applyCambio(manager: EntityManager, solicitud: SolicitudRecord) {
    if (solicitud.tipo === SolicitudCambioTipo.BAJA_CONDOMINO) {
      await manager.query(
        `
        UPDATE usuarios_condominios
        SET estado = 'INACTIVO'
        WHERE id_usuario_condominio = $1 AND id_condominio = $2
        `,
        [solicitud.idUsuarioCondominioObjetivo, solicitud.idCondominio],
      );

      await manager.query(
        `
        UPDATE unidades_ocupantes uo
        SET fecha_fin = CURRENT_DATE
        FROM unidades u
        WHERE uo.id_usuario_condominio = $1
          AND uo.id_unidad = u.id_unidad
          AND u.id_condominio = $2
          AND uo.fecha_fin IS NULL
        `,
        [solicitud.idUsuarioCondominioObjetivo, solicitud.idCondominio],
      );

      return;
    }

    const detalle = solicitud.detalle ?? {};
    const idUnidad = Number(
      detalle.idUnidadDestino ?? detalle.idUnidad ?? detalle.id_unidad ?? 0,
    );
    const tipoOcupacion = String(detalle.tipoOcupacion ?? detalle.tipo_ocupacion ?? 'PROPIETARIO');
    const fechaInicio = String(detalle.fechaInicio ?? detalle.fecha_inicio ?? new Date().toISOString().slice(0, 10));

    if (!Number.isInteger(idUnidad) || idUnidad <= 0) {
      throw new BadRequestException('Para este cambio se requiere un idUnidad valido en detalle.');
    }

    const rawUnidadRows = await manager.query(
      `
      SELECT id_unidad
      FROM unidades
      WHERE id_unidad = $1 AND id_condominio = $2
      LIMIT 1
      `,
      [idUnidad, solicitud.idCondominio],
    );

    const unidadRows = this.normalizeQueryRows(rawUnidadRows);

    if (unidadRows.length === 0) {
      throw new BadRequestException('La unidad destino no pertenece al condominio.');
    }

    await manager.query(
      `
      UPDATE unidades_ocupantes uo
      SET fecha_fin = CURRENT_DATE
      FROM unidades u
      WHERE uo.id_usuario_condominio = $1
        AND uo.id_unidad = u.id_unidad
        AND u.id_condominio = $2
        AND uo.fecha_fin IS NULL
      `,
      [solicitud.idUsuarioCondominioObjetivo, solicitud.idCondominio],
    );

    await manager.query(
      `
      INSERT INTO unidades_ocupantes (tipo_ocupacion, fecha_inicio, fecha_fin, id_usuario_condominio, id_unidad)
      VALUES ($1, $2::date, NULL, $3, $4)
      `,
      [tipoOcupacion, fechaInicio, solicitud.idUsuarioCondominioObjetivo, idUnidad],
    );
  }

  private validateDetalleByTipo(tipo: string, detalle: unknown) {
    if (tipo === SolicitudCambioTipo.BAJA_CONDOMINO) {
      return;
    }

    if (!detalle || typeof detalle !== 'object') {
      throw new BadRequestException('detalle es obligatorio para cambios de ocupacion o unidad.');
    }

    const map = detalle as Record<string, unknown>;
    const idUnidad = Number(map.idUnidadDestino ?? map.idUnidad ?? map.id_unidad ?? 0);
    if (!Number.isInteger(idUnidad) || idUnidad <= 0) {
      throw new BadRequestException('detalle.idUnidadDestino es obligatorio para este tipo de cambio.');
    }
  }

  private async assertMembershipInCondominio(
    manager: EntityManager,
    idCondominio: number,
    idUsuarioCondominio: number,
    errorMessage: string,
  ) {
    const rawRows = await manager.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_usuario_condominio = $1
        AND id_condominio = $2
      LIMIT 1
      `,
      [idUsuarioCondominio, idCondominio],
    );

    const rows = this.normalizeQueryRows(rawRows);

    if (rows.length === 0) {
      throw new BadRequestException(errorMessage);
    }
  }

  private async getSolicitudForUpdate(
    manager: EntityManager,
    idCondominio: number,
    idSolicitud: number,
  ): Promise<SolicitudRecord> {
    const rawRows = await manager.query(
      `
      SELECT *
      FROM solicitudes_cambio_condomino
      WHERE id_solicitud = $1
        AND id_condominio = $2
      LIMIT 1
      `,
      [idSolicitud, idCondominio],
    );

    const rows = this.normalizeQueryRows(rawRows);

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la solicitud para el condominio indicado.');
    }

    return this.toRecord(rows[0] as Record<string, unknown>);
  }

  private async insertInternalNotification(
    manager: EntityManager,
    idUsuarioCondominio: number,
    idCondominio: number,
    tipo: string,
    asunto: string,
    mensaje: string,
  ) {
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
      [tipo, asunto, mensaje, idUsuarioCondominio],
    );

    this.notificacionesGateway.emitNotificacionChanged(idCondominio, idUsuarioCondominio, {
      tipo,
      asunto,
      idUsuarioCondominio,
    });
  }

  private async getDestinatariosSolicitud(manager: EntityManager, idSolicitud: number) {
    const rawRows = await manager.query(
      `
      SELECT id_usuario_condominio_solicitante, id_usuario_condominio_objetivo
      FROM solicitudes_cambio_condomino
      WHERE id_solicitud = $1
      LIMIT 1
      `,
      [idSolicitud],
    );

    const rows = this.normalizeQueryRows(rawRows);
    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la solicitud para recuperar destinatarios.');
    }

    const row = rows[0];
    const idSolicitante = Number(row.id_usuario_condominio_solicitante ?? row.idUsuarioCondominioSolicitante);
    const idObjetivo = Number(row.id_usuario_condominio_objetivo ?? row.idUsuarioCondominioObjetivo);

    if (!Number.isInteger(idSolicitante) || idSolicitante <= 0 || !Number.isInteger(idObjetivo) || idObjetivo <= 0) {
      throw new BadRequestException('No se pudieron determinar los destinatarios de la solicitud.');
    }

    return { idSolicitante, idObjetivo };
  }

  private async getAdminsByCondominio(manager: EntityManager, idCondominio: number): Promise<number[]> {
    const rawRows = await manager.query(
      `
      SELECT id_usuario_condominio
      FROM usuarios_condominios
      WHERE id_condominio = $1
        AND rol = 'ADMINISTRADOR'
        AND estado = 'ACTIVO'
      `,
      [idCondominio],
    );

    const rows = this.normalizeQueryRows(rawRows);
    return rows
      .map((row) => Number(row.id_usuario_condominio ?? row.idUsuarioCondominio))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  private emitChanged(record: SolicitudRecord, tipo: string) {
    this.notificacionesGateway.emitNotificacionChanged(record.idCondominio, record.idUsuarioCondominioSolicitante, {
      tipo,
      solicitud: record,
    });
    this.notificacionesGateway.emitNotificacionChanged(record.idCondominio, record.idUsuarioCondominioObjetivo, {
      tipo,
      solicitud: record,
    });
  }

  private toRecord(row: Record<string, unknown>): SolicitudRecord {
    const idSolicitud = row.id_solicitud ?? row.idSolicitud;
    const idCondominio = row.id_condominio ?? row.idCondominio;
    const idSolicitante = row.id_usuario_condominio_solicitante ?? row.idUsuarioCondominioSolicitante;
    const idObjetivo = row.id_usuario_condominio_objetivo ?? row.idUsuarioCondominioObjetivo;
    const idAprobador = row.id_usuario_condominio_aprobador ?? row.idUsuarioCondominioAprobador;
    const comentario = row.comentario_resolucion ?? row.comentarioResolucion;
    const fechaSolicitud = row.fecha_solicitud ?? row.fechaSolicitud;
    const fechaResolucion = row.fecha_resolucion ?? row.fechaResolucion;
    const fechaEjecucion = row.fecha_ejecucion ?? row.fechaEjecucion;

    return {
      idSolicitud: Number(idSolicitud),
      idCondominio: Number(idCondominio),
      idUsuarioCondominioSolicitante: Number(idSolicitante),
      idUsuarioCondominioObjetivo: Number(idObjetivo),
      tipo: String(row.tipo),
      estado: String(row.estado),
      motivo: String(row.motivo),
      detalle: row.detalle && typeof row.detalle === 'object' ? (row.detalle as Record<string, unknown>) : null,
      idUsuarioCondominioAprobador: idAprobador
        ? Number(idAprobador)
        : null,
      comentarioResolucion: comentario ? String(comentario) : null,
      fechaSolicitud: this.toIso(fechaSolicitud),
      fechaResolucion: fechaResolucion ? this.toIso(fechaResolucion) : null,
      fechaEjecucion: fechaEjecucion ? this.toIso(fechaEjecucion) : null,
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

  private toIso(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return new Date().toISOString();
  }
}
