import { Injectable } from '@nestjs/common';
import { CreateAvisoDto } from './dto/create-aviso.dto';
import { DataSource } from 'typeorm';
import { AvisosGateway } from './avisos.gateway';

type AvisoRecord = {
  idAviso: number;
  idCondominio: number;
  idUsuarioCondominioAdmin: number;
  titulo: string;
  contenido: string;
  fechaPublicacion: string;
};

@Injectable()
export class AvisosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly avisosGateway: AvisosGateway,
  ) {}

  async findByCondominio(idCondominio: number): Promise<AvisoRecord[]> {
    const rows = await this.dataSource.query(
      `
      SELECT
        id_aviso,
        id_condominio,
        id_usuario_condominio_admin,
        titulo,
        contenido,
        fecha_publicacion
      FROM avisos
      WHERE id_condominio = $1
      ORDER BY fecha_publicacion DESC
      `,
      [idCondominio],
    );

    return rows.map((row: Record<string, unknown>) => this.toAvisoRecord(row));
  }

  async create(input: CreateAvisoDto): Promise<AvisoRecord> {
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
      [input.titulo.trim(), input.contenido.trim(), input.idCondominio, input.idUsuarioCondominioAdmin],
    );

    const aviso = this.toAvisoRecord(rows[0] as Record<string, unknown>);
    this.avisosGateway.emitAvisoChanged(aviso.idCondominio, {
      tipo: 'CREADO',
      aviso,
    });
    return aviso;
  }

  private toAvisoRecord(row: Record<string, unknown>): AvisoRecord {
    return {
      idAviso: Number(row.id_aviso),
      idCondominio: Number(row.id_condominio),
      idUsuarioCondominioAdmin: Number(row.id_usuario_condominio_admin),
      titulo: String(row.titulo),
      contenido: String(row.contenido),
      fechaPublicacion: new Date(String(row.fecha_publicacion)).toISOString(),
    };
  }
}