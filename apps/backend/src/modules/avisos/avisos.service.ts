import { Injectable, Logger } from '@nestjs/common';
import { CreateAvisoDto } from './dto/create-aviso.dto';
import { DataSource } from 'typeorm';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
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
  private readonly logger = new Logger(AvisosService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly avisosGateway: AvisosGateway,
    private readonly notificaciones: NotificacionesService,
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

    // Publicar un aviso ahora tambien genera notificacion en la bandeja y push
    // para todo el condominio. El correo es opcional: lo decide el
    // administrador porque un aviso a 200 unidades son 200 correos.
    await this.notificarAviso(aviso, Boolean(input.enviarPorCorreo));

    return aviso;
  }

  private async notificarAviso(aviso: AvisoRecord, enviarPorCorreo: boolean): Promise<void> {
    try {
      await this.notificaciones.crearParaCondominio(aviso.idCondominio, {
        tipo: 'AVISO_PUBLICADO',
        asunto: aviso.titulo,
        mensaje: aviso.contenido,
        // El canal interno siempre se respeta por usuario (`usar_interna`).
        // El correo se fuerza solo cuando el administrador lo pidio.
        canales: enviarPorCorreo ? { email: true } : { email: false },
      });
    } catch (error) {
      // Un fallo al notificar no debe tumbar la publicacion del aviso.
      this.logger.warn(
        `No fue posible notificar el aviso ${aviso.idAviso}: ${(error as Error).message}`,
      );
    }
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