import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { VotacionEstado } from '../../common/enums/votacion-estado.enum';
import { VotoOpcion } from '../../common/enums/voto-opcion.enum';
import { CerrarVotacionDto } from './dto/cerrar-votacion.dto';
import { CreateCambioCuotaVotacionDto, EjecutarCambioCuotaDto } from './dto/create-cambio-cuota-votacion.dto';
import { CreateVotacionDto } from './dto/create-votacion.dto';
import { VotarVotacionDto } from './dto/votar-votacion.dto';
import { DataSource } from 'typeorm';
import { VotacionesGateway } from './votaciones.gateway';
import { AvisosGateway } from '../avisos/avisos.gateway';

type VotacionTipo = 'GENERAL' | 'CAMBIO_CUOTA';
type EstadoCambioCuota = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EJECUTADA';

type VotacionResumen = {
  idVotacion: number;
  idCondominio: number;
  pregunta: string;
  tipo: VotacionTipo;
  estado: VotacionEstado;
  fechaInicio: string;
  fechaFin: string;
  aFavor: number;
  enContra: number;
  totalVotos: number;
  cambioCuota: {
    montoPropuesto: number;
    recargoPropuesto: number;
    diaLimitePropuesto: number;
    periodoAplicacion: string;
    estadoPropuesta: EstadoCambioCuota;
    motivo: string | null;
    ejecutable: boolean;
  } | null;
};

@Injectable()
export class VotacionesService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly votacionesGateway: VotacionesGateway,
    private readonly avisosGateway: AvisosGateway,
  ) {}

  async onModuleInit() {
    await this.ensureCambioCuotaTable();
  }

  async listByCondominio(idCondominio: number, estado?: VotacionEstado): Promise<VotacionResumen[]> {
    await this.ensureCambioCuotaTable();
    const params: Array<number | string> = [idCondominio];
    let estadoClause = '';

    if (estado) {
      params.push(estado);
      estadoClause = ` AND v.estado = $${params.length}`;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        v.id_votacion,
        v.id_condominio,
        v.pregunta,
        CASE WHEN cc.id_votacion IS NULL THEN 'GENERAL' ELSE 'CAMBIO_CUOTA' END AS tipo,
        v.estado,
        v.fecha_inicio,
        v.fecha_fin,
        COALESCE(SUM(CASE WHEN vo.opcion = 'FAVOR' THEN 1 ELSE 0 END), 0) AS a_favor,
        COALESCE(SUM(CASE WHEN vo.opcion = 'CONTRA' THEN 1 ELSE 0 END), 0) AS en_contra,
        COUNT(vo.id_voto) AS total_votos,
        cc.monto_propuesto,
        cc.recargo_propuesto,
        cc.dia_limite_propuesto,
        cc.periodo_aplicacion,
        cc.estado_propuesta,
        cc.motivo
      FROM votaciones v
      LEFT JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
      LEFT JOIN votos vo ON vo.id_votacion = v.id_votacion
      WHERE v.id_condominio = $1${estadoClause}
      GROUP BY v.id_votacion, cc.id_votacion
      ORDER BY v.fecha_inicio DESC
      `,
      params,
    );

    return rows.map((row: Record<string, unknown>) => this.toResumen(row));
  }

  async create(input: CreateVotacionDto): Promise<VotacionResumen> {
    await this.ensureCambioCuotaTable();
    const fechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : new Date();
    const fechaFin = input.fechaFin ? new Date(input.fechaFin) : new Date(fechaInicio.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (fechaFin.getTime() < fechaInicio.getTime()) {
      throw new BadRequestException('La fecha de fin no puede ser menor que la fecha de inicio.');
    }

    const rows = await this.dataSource.query(
      `
      INSERT INTO votaciones (
        pregunta,
        fecha_inicio,
        fecha_fin,
        estado,
        id_condominio,
        id_usuario_condominio_admin
      )
      VALUES ($1, $2, $3, 'ABIERTA', $4, $5)
      RETURNING id_votacion, id_condominio, pregunta, estado, fecha_inicio, fecha_fin
      `,
      [
        input.pregunta.trim(),
        fechaInicio.toISOString(),
        fechaFin.toISOString(),
        input.idCondominio,
        input.idUsuarioCondominioAdmin,
      ],
    );

    const resumen = this.toResumen(rows[0] as Record<string, unknown>);
    this.votacionesGateway.emitVotacionChanged(input.idCondominio, {
      tipo: 'CREADA',
      votacion: resumen,
    });
    return resumen;
  }

  async createCambioCuota(input: CreateCambioCuotaVotacionDto): Promise<VotacionResumen> {
    await this.ensureCambioCuotaTable();
    const fechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : new Date();
    const fechaFin = input.fechaFin
      ? new Date(input.fechaFin)
      : new Date(fechaInicio.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (fechaFin.getTime() < fechaInicio.getTime()) {
      throw new BadRequestException('La fecha de fin no puede ser menor que la fecha de inicio.');
    }

    const periodoAplicacion = this.nextPeriodKey();
    const recargoPropuesto = input.recargoPropuesto ?? 0;
    const diaLimitePropuesto = input.diaLimitePropuesto ?? 10;
    const motivo = input.motivo?.trim() || null;
    const pregunta = `Aprobar cambio de cuota mensual a $${Number(input.montoPropuesto).toFixed(2)} para periodo ${periodoAplicacion}?`;

    const resumen = await this.dataSource.transaction(async (manager) => {
      const votacionRows = await manager.query(
        `
        INSERT INTO votaciones (
          pregunta,
          fecha_inicio,
          fecha_fin,
          estado,
          id_condominio,
          id_usuario_condominio_admin
        )
        VALUES ($1, $2, $3, 'ABIERTA', $4, $5)
        RETURNING id_votacion, id_condominio, pregunta, estado, fecha_inicio, fecha_fin
        `,
        [pregunta, fechaInicio.toISOString(), fechaFin.toISOString(), input.idCondominio, input.idUsuarioCondominioAdmin],
      );

      const idVotacion = Number(votacionRows[0].id_votacion);

      await manager.query(
        `
        INSERT INTO votaciones_cambio_cuota (
          id_votacion,
          monto_propuesto,
          recargo_propuesto,
          dia_limite_propuesto,
          estado_propuesta,
          periodo_aplicacion,
          motivo
        )
        VALUES ($1, $2, $3, $4, 'PENDIENTE', $5, $6)
        `,
        [idVotacion, input.montoPropuesto, recargoPropuesto, diaLimitePropuesto, periodoAplicacion, motivo],
      );

      const rows = await manager.query(
        `
        SELECT
          v.id_votacion,
          v.id_condominio,
          v.pregunta,
          'CAMBIO_CUOTA' AS tipo,
          v.estado,
          v.fecha_inicio,
          v.fecha_fin,
          0::INT AS a_favor,
          0::INT AS en_contra,
          0::INT AS total_votos,
          cc.monto_propuesto,
          cc.recargo_propuesto,
          cc.dia_limite_propuesto,
          cc.periodo_aplicacion,
          cc.estado_propuesta,
          cc.motivo
        FROM votaciones v
        JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
        WHERE v.id_votacion = $1
        `,
        [idVotacion],
      );

      return this.toResumen(rows[0] as Record<string, unknown>);
    });

    this.votacionesGateway.emitVotacionChanged(input.idCondominio, {
      tipo: 'CREADA_CAMBIO_CUOTA',
      votacion: resumen,
    });

    return resumen;
  }

  async votar(input: VotarVotacionDto): Promise<VotacionResumen> {
    await this.ensureCambioCuotaTable();
    return this.dataSource.transaction(async (manager) => {
      const votacionRows = await manager.query(
        `
        SELECT id_votacion, id_condominio, estado, pregunta, fecha_inicio, fecha_fin
        FROM votaciones
        WHERE id_votacion = $1 AND id_condominio = $2
        LIMIT 1
        `,
        [input.idVotacion, input.idCondominio],
      );

      if (votacionRows.length === 0) {
        throw new NotFoundException('No se encontro la votacion para el condominio indicado.');
      }

      const votacion = votacionRows[0] as Record<string, unknown>;
      if (String(votacion.estado) !== VotacionEstado.ABIERTA) {
        throw new BadRequestException('La votacion ya no esta abierta.');
      }

      const votoRows = await manager.query(
        `
        SELECT id_voto
        FROM votos
        WHERE id_votacion = $1 AND id_usuario_condominio = $2
        LIMIT 1
        `,
        [input.idVotacion, input.idUsuarioCondominio],
      );
      if (votoRows.length > 0) {
        throw new BadRequestException('El usuario ya emitio su voto para esta votacion.');
      }

      await manager.query(
        `
        INSERT INTO votos (opcion, fecha_emision, id_votacion, id_usuario_condominio)
        VALUES ($1, NOW(), $2, $3)
        `,
        [input.opcion, input.idVotacion, input.idUsuarioCondominio],
      );

      const resumenRows = await manager.query(
        `
        SELECT
          v.id_votacion,
          v.id_condominio,
          v.pregunta,
          CASE WHEN cc.id_votacion IS NULL THEN 'GENERAL' ELSE 'CAMBIO_CUOTA' END AS tipo,
          v.estado,
          v.fecha_inicio,
          v.fecha_fin,
          COALESCE(SUM(CASE WHEN vo.opcion = 'FAVOR' THEN 1 ELSE 0 END), 0) AS a_favor,
          COALESCE(SUM(CASE WHEN vo.opcion = 'CONTRA' THEN 1 ELSE 0 END), 0) AS en_contra,
          COUNT(vo.id_voto) AS total_votos,
          cc.monto_propuesto,
          cc.recargo_propuesto,
          cc.dia_limite_propuesto,
          cc.periodo_aplicacion,
          cc.estado_propuesta,
          cc.motivo
        FROM votaciones v
        LEFT JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
        LEFT JOIN votos vo ON vo.id_votacion = v.id_votacion
        WHERE v.id_votacion = $1
        GROUP BY v.id_votacion, cc.id_votacion
        `,
        [input.idVotacion],
      );

      const resumen = this.toResumen(resumenRows[0] as Record<string, unknown>);
      this.votacionesGateway.emitVotacionChanged(input.idCondominio, {
        tipo: 'VOTO_EMITIDO',
        votacion: resumen,
      });
      return resumen;
    });
  }

  async cerrar(input: CerrarVotacionDto): Promise<VotacionResumen> {
    await this.ensureCambioCuotaTable();
    const rows = await this.dataSource.query(
      `
      UPDATE votaciones
      SET estado = 'CERRADA'
      WHERE id_votacion = $1 AND id_condominio = $2
      RETURNING id_votacion, id_condominio, pregunta, estado, fecha_inicio, fecha_fin, id_usuario_condominio_admin
      `,
      [input.idVotacion, input.idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro la votacion para el condominio indicado.');
    }

    let resumen = await this.getResumenByVotacion(input.idVotacion);

    if (resumen.tipo === 'CAMBIO_CUOTA' && resumen.cambioCuota && resumen.cambioCuota.estadoPropuesta === 'PENDIENTE') {
      const aprobado = resumen.aFavor > resumen.enContra;
      const estadoPropuesta: EstadoCambioCuota = aprobado ? 'APROBADA' : 'RECHAZADA';

      await this.dataSource.query(
        `
        UPDATE votaciones_cambio_cuota
        SET estado_propuesta = $1
        WHERE id_votacion = $2
        `,
        [estadoPropuesta, input.idVotacion],
      );

      resumen = await this.getResumenByVotacion(input.idVotacion);

      if (aprobado) {
        let idUsuarioCondominioAdmin = Number(
          (rows[0] as Record<string, unknown>).id_usuario_condominio_admin ??
            (rows[0] as Record<string, unknown>).idUsuarioCondominioAdmin ??
            0,
        );

        if (!Number.isInteger(idUsuarioCondominioAdmin) || idUsuarioCondominioAdmin <= 0) {
          const adminRows = await this.dataSource.query(
            `
            SELECT id_usuario_condominio_admin
            FROM votaciones
            WHERE id_votacion = $1
            LIMIT 1
            `,
            [input.idVotacion],
          );
          idUsuarioCondominioAdmin = Number(adminRows?.[0]?.id_usuario_condominio_admin ?? 0);
        }

        if (Number.isInteger(idUsuarioCondominioAdmin) && idUsuarioCondominioAdmin > 0) {
        await this.publishAvisoCambioCuota(
          input.idCondominio,
          idUsuarioCondominioAdmin,
          `La comunidad aprobo el cambio de cuota a $${resumen.cambioCuota?.montoPropuesto.toFixed(2)} para ${resumen.cambioCuota?.periodoAplicacion}.`,
        );
        }
      }
    }

    this.votacionesGateway.emitVotacionChanged(input.idCondominio, {
      tipo: 'CERRADA',
      votacion: resumen,
    });
    return resumen;
  }

  async listCambiosCuota(idCondominio: number): Promise<VotacionResumen[]> {
    await this.ensureCambioCuotaTable();
    const rows = await this.dataSource.query(
      `
      SELECT
        v.id_votacion,
        v.id_condominio,
        v.pregunta,
        'CAMBIO_CUOTA' AS tipo,
        v.estado,
        v.fecha_inicio,
        v.fecha_fin,
        COALESCE(SUM(CASE WHEN vo.opcion = 'FAVOR' THEN 1 ELSE 0 END), 0) AS a_favor,
        COALESCE(SUM(CASE WHEN vo.opcion = 'CONTRA' THEN 1 ELSE 0 END), 0) AS en_contra,
        COUNT(vo.id_voto) AS total_votos,
        cc.monto_propuesto,
        cc.recargo_propuesto,
        cc.dia_limite_propuesto,
        cc.periodo_aplicacion,
        cc.estado_propuesta,
        cc.motivo
      FROM votaciones v
      JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
      LEFT JOIN votos vo ON vo.id_votacion = v.id_votacion
      WHERE v.id_condominio = $1
      GROUP BY v.id_votacion, cc.id_votacion
      ORDER BY v.fecha_inicio DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => this.toResumen(row));
  }

  async ejecutarCambioCuota(input: EjecutarCambioCuotaDto): Promise<VotacionResumen> {
    await this.ensureCambioCuotaTable();

    const resumen = await this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
        SELECT
          v.id_votacion,
          v.id_condominio,
          v.pregunta,
          v.estado,
          v.fecha_inicio,
          v.fecha_fin,
          cc.monto_propuesto,
          cc.recargo_propuesto,
          cc.dia_limite_propuesto,
          cc.periodo_aplicacion,
          cc.estado_propuesta,
          cc.motivo
        FROM votaciones v
        JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
        WHERE v.id_votacion = $1 AND v.id_condominio = $2
        LIMIT 1
        `,
        [input.idVotacion, input.idCondominio],
      );

      if (rows.length === 0) {
        throw new NotFoundException('No se encontro la votacion especial de cambio de cuota.');
      }

      const item = rows[0] as Record<string, unknown>;
      if (String(item.estado) !== VotacionEstado.CERRADA) {
        throw new BadRequestException('La votacion debe estar cerrada antes de ejecutar el cambio de cuota.');
      }

      if (String(item.estado_propuesta) !== 'APROBADA') {
        throw new BadRequestException('Solo las propuestas aprobadas por la comunidad pueden ejecutarse.');
      }

      const periodoAplicacion = String(item.periodo_aplicacion);
      const monto = Number(item.monto_propuesto);
      const recargo = Number(item.recargo_propuesto ?? 0);
      const diaLimite = Number(item.dia_limite_propuesto ?? 10);

      await this.createCuotasPeriodo(
        manager,
        input.idCondominio,
        periodoAplicacion,
        monto,
        recargo,
        diaLimite,
      );

      await manager.query(
        `
        UPDATE votaciones_cambio_cuota
        SET estado_propuesta = 'EJECUTADA', fecha_ejecucion = NOW()
        WHERE id_votacion = $1
        `,
        [input.idVotacion],
      );

      const resumenRows = await manager.query(
        `
        SELECT
          v.id_votacion,
          v.id_condominio,
          v.pregunta,
          'CAMBIO_CUOTA' AS tipo,
          v.estado,
          v.fecha_inicio,
          v.fecha_fin,
          COALESCE(SUM(CASE WHEN vo.opcion = 'FAVOR' THEN 1 ELSE 0 END), 0) AS a_favor,
          COALESCE(SUM(CASE WHEN vo.opcion = 'CONTRA' THEN 1 ELSE 0 END), 0) AS en_contra,
          COUNT(vo.id_voto) AS total_votos,
          cc.monto_propuesto,
          cc.recargo_propuesto,
          cc.dia_limite_propuesto,
          cc.periodo_aplicacion,
          cc.estado_propuesta,
          cc.motivo
        FROM votaciones v
        JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
        LEFT JOIN votos vo ON vo.id_votacion = v.id_votacion
        WHERE v.id_votacion = $1
        GROUP BY v.id_votacion, cc.id_votacion
        `,
        [input.idVotacion],
      );

      return this.toResumen(resumenRows[0] as Record<string, unknown>);
    });

    await this.publishAvisoCambioCuota(
      input.idCondominio,
      input.idUsuarioCondominioAdmin,
      `Se ejecuto el cambio de cuota aprobado por votacion. Nuevo monto: $${resumen.cambioCuota?.montoPropuesto.toFixed(2)} para ${resumen.cambioCuota?.periodoAplicacion}.`,
    );

    this.votacionesGateway.emitVotacionChanged(input.idCondominio, {
      tipo: 'CAMBIO_CUOTA_EJECUTADO',
      votacion: resumen,
    });

    return resumen;
  }

  private async getResumenByVotacion(idVotacion: number): Promise<VotacionResumen> {
    const resumenRows = await this.dataSource.query(
      `
      SELECT
        v.id_votacion,
        v.id_condominio,
        v.pregunta,
        CASE WHEN cc.id_votacion IS NULL THEN 'GENERAL' ELSE 'CAMBIO_CUOTA' END AS tipo,
        v.estado,
        v.fecha_inicio,
        v.fecha_fin,
        COALESCE(SUM(CASE WHEN vo.opcion = 'FAVOR' THEN 1 ELSE 0 END), 0) AS a_favor,
        COALESCE(SUM(CASE WHEN vo.opcion = 'CONTRA' THEN 1 ELSE 0 END), 0) AS en_contra,
        COUNT(vo.id_voto) AS total_votos,
        cc.monto_propuesto,
        cc.recargo_propuesto,
        cc.dia_limite_propuesto,
        cc.periodo_aplicacion,
        cc.estado_propuesta,
        cc.motivo
      FROM votaciones v
      LEFT JOIN votaciones_cambio_cuota cc ON cc.id_votacion = v.id_votacion
      LEFT JOIN votos vo ON vo.id_votacion = v.id_votacion
      WHERE v.id_votacion = $1
      GROUP BY v.id_votacion, cc.id_votacion
      `,
      [idVotacion],
    );

    return this.toResumen(resumenRows[0] as Record<string, unknown>);
  }

  private async createCuotasPeriodo(
    manager: { query: (sql: string, params?: Array<unknown>) => Promise<Array<Record<string, unknown>>> },
    idCondominio: number,
    periodo: string,
    monto: number,
    recargo: number,
    diaLimite: number,
  ) {
    const fechaLimite = this.periodDeadline(periodo, diaLimite);
    const unidades = await manager.query(
      `
      SELECT id_unidad
      FROM unidades
      WHERE id_condominio = $1 AND estado = 'ACTIVA'
      `,
      [idCondominio],
    );

    for (const unidad of unidades) {
      const idUnidad = Number(unidad.id_unidad);
      await manager.query(
        `
        INSERT INTO cuotas (
          periodo,
          monto_base,
          fecha_limite,
          recargo_por_dia,
          estado,
          id_condominio,
          id_unidad
        )
        VALUES ($1, $2, $3, $4, 'PENDIENTE', $5, $6)
        ON CONFLICT (id_unidad, periodo) DO NOTHING
        `,
        [periodo, monto, fechaLimite, recargo, idCondominio, idUnidad],
      );
    }
  }

  private periodDeadline(periodo: string, diaLimite: number): string {
    const [yearRaw, monthRaw] = periodo.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const clampedDay = Math.max(1, Math.min(28, diaLimite));
    const monthPart = String(month).padStart(2, '0');
    const dayPart = String(clampedDay).padStart(2, '0');
    return `${year}-${monthPart}-${dayPart}`;
  }

  private nextPeriodKey() {
    const now = new Date();
    const monthIndex = now.getMonth() + 1;
    const year = monthIndex === 12 ? now.getFullYear() + 1 : now.getFullYear();
    const month = monthIndex === 12 ? 1 : monthIndex + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private async publishAvisoCambioCuota(
    idCondominio: number,
    idUsuarioCondominioAdmin: number,
    contenido: string,
  ) {
    const rows = await this.dataSource.query(
      `
      INSERT INTO avisos (
        titulo,
        contenido,
        fecha_publicacion,
        id_condominio,
        id_usuario_condominio_admin
      )
      VALUES ($1, $2, NOW(), $3, $4)
      RETURNING id_aviso, id_condominio, id_usuario_condominio_admin, titulo, contenido, fecha_publicacion
      `,
      ['Cambio de cuota de mantenimiento', contenido, idCondominio, idUsuarioCondominioAdmin],
    );

    const aviso = rows[0] as Record<string, unknown>;
    this.avisosGateway.emitAvisoChanged(idCondominio, {
      tipo: 'CREADO_AUTOMATICO',
      aviso: {
        idAviso: Number(aviso.id_aviso),
        idCondominio: Number(aviso.id_condominio),
        idUsuarioCondominioAdmin: Number(aviso.id_usuario_condominio_admin),
        titulo: String(aviso.titulo),
        contenido: String(aviso.contenido),
        fechaPublicacion: new Date(String(aviso.fecha_publicacion)).toISOString(),
      },
    });
  }

  private async ensureCambioCuotaTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS votaciones_cambio_cuota (
        id_votacion INT PRIMARY KEY,
        monto_propuesto NUMERIC(12,2) NOT NULL CHECK (monto_propuesto > 0),
        recargo_propuesto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (recargo_propuesto >= 0),
        dia_limite_propuesto INT NOT NULL DEFAULT 10 CHECK (dia_limite_propuesto BETWEEN 1 AND 28),
        estado_propuesta VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_propuesta IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EJECUTADA')),
        periodo_aplicacion VARCHAR(20) NOT NULL,
        motivo TEXT,
        fecha_ejecucion TIMESTAMP,
        CONSTRAINT fk_votacion_cambio_cuota
          FOREIGN KEY (id_votacion) REFERENCES votaciones(id_votacion)
          ON DELETE CASCADE
      )
    `);
  }

  private toResumen(votacion: Record<string, unknown>): VotacionResumen {
    const tipoRaw = String(votacion.tipo ?? 'GENERAL');
    const tipo = tipoRaw === 'CAMBIO_CUOTA' ? 'CAMBIO_CUOTA' : 'GENERAL';
    const estadoPropuestaRaw = String(votacion.estado_propuesta ?? 'PENDIENTE');
    const estadoPropuesta: EstadoCambioCuota =
      estadoPropuestaRaw === 'APROBADA'
        ? 'APROBADA'
        : estadoPropuestaRaw === 'RECHAZADA'
          ? 'RECHAZADA'
          : estadoPropuestaRaw === 'EJECUTADA'
            ? 'EJECUTADA'
            : 'PENDIENTE';

    const aFavor = Number(votacion.a_favor ?? 0);
    const enContra = Number(votacion.en_contra ?? 0);

    return {
      idVotacion: Number(votacion.id_votacion),
      idCondominio: Number(votacion.id_condominio),
      pregunta: String(votacion.pregunta),
      tipo,
      estado: String(votacion.estado) as VotacionEstado,
      fechaInicio: new Date(String(votacion.fecha_inicio)).toISOString(),
      fechaFin: new Date(String(votacion.fecha_fin)).toISOString(),
      aFavor,
      enContra,
      totalVotos: Number(votacion.total_votos ?? 0),
      cambioCuota:
        tipo === 'CAMBIO_CUOTA'
          ? {
              montoPropuesto: Number(votacion.monto_propuesto ?? 0),
              recargoPropuesto: Number(votacion.recargo_propuesto ?? 0),
              diaLimitePropuesto: Number(votacion.dia_limite_propuesto ?? 10),
              periodoAplicacion: String(votacion.periodo_aplicacion ?? ''),
              estadoPropuesta,
              motivo: votacion.motivo ? String(votacion.motivo) : null,
              ejecutable: String(votacion.estado) === VotacionEstado.CERRADA && estadoPropuesta === 'APROBADA',
            }
          : null,
    };
  }
}