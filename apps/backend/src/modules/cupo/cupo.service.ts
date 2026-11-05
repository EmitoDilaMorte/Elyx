import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type ResumenCupo = {
  cupoTotal: number | null;
  unidadesTotales: number;
  unidadesOcupadas: number;
  unidadesLibres: number;
  puedeCrearUnidades: boolean;
};

/**
 * Unico punto de verdad del cupo de unidades y de la operatividad de un
 * condominio. Ningun flujo debe calcular asientos por su cuenta: si el cupo se
 * valida solo en el registro, los demas endpoints lo vuelven decorativo.
 *
 * Definiciones:
 *  - `condominios.cupo_unidades` es el maximo de unidades que pueden EXISTIR (NULL = sin limite).
 *  - Una unidad esta "ocupada" cuando tiene una ocupacion activa (`unidades_ocupantes`).
 *  - "Libre" = unidad ACTIVA sin ocupante activo; ese es el asiento que un
 *    condomino puede reclamar a traves de un link de invitacion.
 */
@Injectable()
export class CupoService {
  constructor(private readonly dataSource: DataSource) {}

  async resumen(idCondominio: number): Promise<ResumenCupo> {
    const rows = await this.dataSource.query(
      `
      SELECT
        c.cupo_unidades,
        (
          SELECT COUNT(*)
          FROM unidades u
          WHERE u.id_condominio = c.id_condominio AND u.estado = 'ACTIVA'
        ) AS unidades_totales,
        (
          SELECT COUNT(*)
          FROM unidades u
          WHERE u.id_condominio = c.id_condominio
            AND u.estado = 'ACTIVA'
            AND EXISTS (
              SELECT 1
              FROM unidades_ocupantes uo
              WHERE uo.id_unidad = u.id_unidad
                AND (uo.fecha_fin IS NULL OR uo.fecha_fin >= CURRENT_DATE)
            )
        ) AS unidades_ocupadas
      FROM condominios c
      WHERE c.id_condominio = $1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    const cupoTotal = row.cupo_unidades === null ? null : Number(row.cupo_unidades);
    const unidadesTotales = Number(row.unidades_totales ?? 0);
    const unidadesOcupadas = Number(row.unidades_ocupadas ?? 0);
    const unidadesLibres = Math.max(unidadesTotales - unidadesOcupadas, 0);

    return {
      cupoTotal,
      unidadesTotales,
      unidadesOcupadas,
      unidadesLibres,
      puedeCrearUnidades: cupoTotal === null || unidadesTotales < cupoTotal,
    };
  }

  async unidadesLibres(idCondominio: number): Promise<number> {
    return (await this.resumen(idCondominio)).unidadesLibres;
  }

  async hayAsientosLibres(idCondominio: number): Promise<boolean> {
    return (await this.unidadesLibres(idCondominio)) > 0;
  }

  /**
   * Un condominio pendiente de verificacion, pendiente de pago, suspendido o
   * inactivo no puede crear unidades ni aprobar invitaciones. El login sigue
   * permitido para que el administrador vea el estado y regularice.
   */
  async assertCondominioOperativo(idCondominio: number): Promise<void> {
    const rows = await this.dataSource.query(
      `
      SELECT c.estado, s.estado AS estado_suscripcion
      FROM condominios c
      LEFT JOIN suscripciones_condominio s ON s.id_condominio = c.id_condominio
      WHERE c.id_condominio = $1
      `,
      [idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('No se encontro el condominio indicado.');
    }

    const row = rows[0] as Record<string, unknown>;
    const estado = String(row.estado ?? '');
    const estadoSuscripcion = row.estado_suscripcion ? String(row.estado_suscripcion) : null;

    if (estado === 'PENDIENTE_VERIFICACION') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'CONDOMINIO_PENDIENTE_VERIFICACION',
        message: 'El condominio aun no ha verificado su correo.',
      });
    }

    if (estado === 'PENDIENTE_PAGO') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUSCRIPCION_PENDIENTE',
        message: 'La suscripcion del condominio esta pendiente de pago.',
      });
    }

    if (estado === 'SUSPENDIDO' || estado === 'INACTIVO') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'CONDOMINIO_SUSPENDIDO',
        message: 'El condominio esta suspendido. Contacta al administrador de la plataforma.',
      });
    }

    // Con el cobro activo, una suscripcion vencida bloquea aunque el estado del
    // condominio no se haya sincronizado todavia (cron diario).
    if (
      process.env.SUSCRIPCION_ENABLED === 'true' &&
      estadoSuscripcion !== null &&
      estadoSuscripcion !== 'ACTIVA'
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUSCRIPCION_PENDIENTE',
        message: 'La suscripcion del condominio no esta activa.',
      });
    }
  }
}
