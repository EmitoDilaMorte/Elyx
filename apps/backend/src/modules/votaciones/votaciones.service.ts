import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VotacionEstado } from '../../common/enums/votacion-estado.enum';
import { VotoOpcion } from '../../common/enums/voto-opcion.enum';
import { CerrarVotacionDto } from './dto/cerrar-votacion.dto';
import { CreateVotacionDto } from './dto/create-votacion.dto';
import { VotarVotacionDto } from './dto/votar-votacion.dto';

type VotacionRecord = {
  idVotacion: number;
  idCondominio: number;
  idUsuarioCondominioAdmin: number;
  pregunta: string;
  fechaInicio: string;
  fechaFin: string;
  estado: VotacionEstado;
};

type VotoRecord = {
  idVotacion: number;
  idUsuarioCondominio: number;
  opcion: VotoOpcion;
  fechaEmision: string;
};

type VotacionResumen = {
  idVotacion: number;
  idCondominio: number;
  pregunta: string;
  estado: VotacionEstado;
  fechaInicio: string;
  fechaFin: string;
  aFavor: number;
  enContra: number;
  totalVotos: number;
};

@Injectable()
export class VotacionesService {
  private nextVotacionId = 3;

  private readonly votaciones: VotacionRecord[] = [
    {
      idVotacion: 1,
      idCondominio: 101,
      idUsuarioCondominioAdmin: 2001,
      pregunta: 'Aprobar presupuesto de jardineria trimestral',
      fechaInicio: '2026-03-01T00:00:00.000Z',
      fechaFin: '2026-03-30T23:59:59.000Z',
      estado: VotacionEstado.ABIERTA,
    },
    {
      idVotacion: 2,
      idCondominio: 202,
      idUsuarioCondominioAdmin: 2002,
      pregunta: 'Renovacion de luminarias en areas comunes',
      fechaInicio: '2026-03-05T00:00:00.000Z',
      fechaFin: '2026-03-29T23:59:59.000Z',
      estado: VotacionEstado.ABIERTA,
    },
  ];

  private readonly votos: VotoRecord[] = [];

  listByCondominio(idCondominio: number, estado?: VotacionEstado): VotacionResumen[] {
    return this.votaciones
      .filter((item) => item.idCondominio === idCondominio)
      .filter((item) => (estado ? item.estado === estado : true))
      .map((item) => this.toResumen(item));
  }

  create(input: CreateVotacionDto): VotacionResumen {
    const fechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : new Date();
    const fechaFin = input.fechaFin ? new Date(input.fechaFin) : new Date(fechaInicio.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (fechaFin.getTime() < fechaInicio.getTime()) {
      throw new BadRequestException('La fecha de fin no puede ser menor que la fecha de inicio.');
    }

    const votacion: VotacionRecord = {
      idVotacion: this.nextVotacionId,
      idCondominio: input.idCondominio,
      idUsuarioCondominioAdmin: input.idUsuarioCondominioAdmin,
      pregunta: input.pregunta.trim(),
      fechaInicio: fechaInicio.toISOString(),
      fechaFin: fechaFin.toISOString(),
      estado: VotacionEstado.ABIERTA,
    };

    this.nextVotacionId += 1;
    this.votaciones.push(votacion);
    return this.toResumen(votacion);
  }

  votar(input: VotarVotacionDto): VotacionResumen {
    const votacion = this.votaciones.find(
      (item) => item.idVotacion === input.idVotacion && item.idCondominio === input.idCondominio,
    );

    if (!votacion) {
      throw new NotFoundException('No se encontro la votacion para el condominio indicado.');
    }

    if (votacion.estado !== VotacionEstado.ABIERTA) {
      throw new BadRequestException('La votacion ya no esta abierta.');
    }

    const votoExistente = this.votos.find(
      (item) => item.idVotacion === input.idVotacion && item.idUsuarioCondominio === input.idUsuarioCondominio,
    );
    if (votoExistente) {
      throw new BadRequestException('El usuario ya emitio su voto para esta votacion.');
    }

    this.votos.push({
      idVotacion: input.idVotacion,
      idUsuarioCondominio: input.idUsuarioCondominio,
      opcion: input.opcion,
      fechaEmision: new Date().toISOString(),
    });

    return this.toResumen(votacion);
  }

  cerrar(input: CerrarVotacionDto): VotacionResumen {
    const votacion = this.votaciones.find(
      (item) => item.idVotacion === input.idVotacion && item.idCondominio === input.idCondominio,
    );

    if (!votacion) {
      throw new NotFoundException('No se encontro la votacion para el condominio indicado.');
    }

    votacion.estado = VotacionEstado.CERRADA;
    return this.toResumen(votacion);
  }

  private toResumen(votacion: VotacionRecord): VotacionResumen {
    const votos = this.votos.filter((item) => item.idVotacion === votacion.idVotacion);
    const aFavor = votos.filter((item) => item.opcion === VotoOpcion.FAVOR).length;
    const enContra = votos.filter((item) => item.opcion === VotoOpcion.CONTRA).length;

    return {
      idVotacion: votacion.idVotacion,
      idCondominio: votacion.idCondominio,
      pregunta: votacion.pregunta,
      estado: votacion.estado,
      fechaInicio: votacion.fechaInicio,
      fechaFin: votacion.fechaFin,
      aFavor,
      enContra,
      totalVotos: votos.length,
    };
  }
}