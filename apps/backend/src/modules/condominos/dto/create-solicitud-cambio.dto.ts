import { IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SolicitudCambioTipo } from '../../../common/enums/solicitud-cambio-tipo.enum';

const TIPOS = [
  SolicitudCambioTipo.BAJA_CONDOMINO,
  SolicitudCambioTipo.CAMBIO_OCUPACION,
  SolicitudCambioTipo.CAMBIO_UNIDAD,
] as const;

export class CreateSolicitudCambioDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioSolicitante!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioObjetivo!: number;

  @IsString()
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @IsString()
  @MinLength(5)
  motivo!: string;

  @IsOptional()
  @IsObject()
  detalle?: Record<string, unknown>;
}

export class ResolverSolicitudCambioDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idSolicitud!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  @IsOptional()
  @IsString()
  comentario?: string;
}

export class CreateAltaCondominoAdminDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsString()
  @MinLength(2)
  apellidoPaterno!: string;

  @IsOptional()
  @IsString()
  apellidoMaterno?: string;

  @IsString()
  @MinLength(5)
  correo!: string;

  @IsInt()
  @Min(1)
  idUnidad!: number;

  @IsOptional()
  @IsString()
  @IsIn(['PROPIETARIO', 'INQUILINO', 'HABITANTE'])
  tipoOcupacion?: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE';
}
