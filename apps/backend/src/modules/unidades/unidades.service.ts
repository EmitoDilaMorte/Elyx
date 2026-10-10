import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UnidadConOcupante } from '../types/unidad-con-ocupante.interface';

@Injectable()
export class UnidadesService {
  constructor(private readonly dataSource: DataSource) {}

  // Aquí van los demás métodos del servicio.

  async getUnidadByUsuarioCondominio(
    idUsuarioCondominio: number,
  ): Promise<UnidadConOcupante> {
    const rows = await this.dataSource.query(
      `SELECT
        u.id_unidad,
        u.clave_unidad,
        u.tipo_unidad,
        uo.tipo_ocupacion,
        uo.fecha_inicio,
        uo.fecha_fin
      FROM unidades u
      JOIN unidades_ocupantes uo ON uo.id_unidad = u.id_unidad
      WHERE uo.id_usuario_condominio = $1
        AND uo.fecha_fin IS NULL
      LIMIT 1`,
      [idUsuarioCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'No se encontró la unidad para el usuario condominio indicado.',
      );
    }

    const row = rows[0] as Record<string, unknown>;

    return {
      idUnidad: Number(row.id_unidad),
      claveUnidad: String(row.clave_unidad),
      tipoUnidad: String(row.tipo_unidad),
      tipoOcupacion: String(row.tipo_ocupacion),
      fechaInicio: String(row.fecha_inicio),
      fechaFin: row.fecha_fin ? String(row.fecha_fin) : null,
    };
  }
}