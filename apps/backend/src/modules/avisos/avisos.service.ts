import { Injectable } from '@nestjs/common';
import { CreateAvisoDto } from './dto/create-aviso.dto';

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
  private nextAvisoId = 3;

  private readonly avisos: AvisoRecord[] = [
    {
      idAviso: 1,
      idCondominio: 101,
      idUsuarioCondominioAdmin: 2001,
      titulo: 'Mantenimiento de cisterna',
      contenido: 'Habra suspension de agua de 10:00 a 12:00.',
      fechaPublicacion: '2026-03-13T09:00:00.000Z',
    },
    {
      idAviso: 2,
      idCondominio: 202,
      idUsuarioCondominioAdmin: 2002,
      titulo: 'Asamblea extraordinaria',
      contenido: 'Reunion en salon comun el sabado a las 18:00.',
      fechaPublicacion: '2026-03-18T09:00:00.000Z',
    },
  ];

  findByCondominio(idCondominio: number): AvisoRecord[] {
    return this.avisos
      .filter((item) => item.idCondominio === idCondominio)
      .sort((a, b) => b.fechaPublicacion.localeCompare(a.fechaPublicacion));
  }

  create(input: CreateAvisoDto): AvisoRecord {
    const nuevoAviso: AvisoRecord = {
      idAviso: this.nextAvisoId,
      idCondominio: input.idCondominio,
      idUsuarioCondominioAdmin: input.idUsuarioCondominioAdmin,
      titulo: input.titulo.trim(),
      contenido: input.contenido.trim(),
      fechaPublicacion: new Date().toISOString(),
    };

    this.nextAvisoId += 1;
    this.avisos.push(nuevoAviso);
    return nuevoAviso;
  }
}