import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const TIPOS_OCUPACION = ['PROPIETARIO', 'INQUILINO', 'HABITANTE'] as const;

export class CrearSolicitudInvitacionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  apellidoPaterno!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  apellidoMaterno?: string;

  @IsEmail()
  @MaxLength(150)
  correo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUnidad!: number;

  @IsOptional()
  @IsIn(TIPOS_OCUPACION)
  tipoOcupacion?: (typeof TIPOS_OCUPACION)[number];

  /**
   * Obligatorio solo si la cuenta no existe. Si el correo ya esta registrado,
   * se ignora y la propiedad se prueba con el enlace enviado por correo.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

export class ConfirmarSolicitudDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}

export class ResolverSolicitudAltaDto {
  @IsInt()
  @Min(1)
  idSolicitud!: number;

  /**
   * Opcional por compatibilidad: el backend resuelve al revisor a partir del
   * JWT, nunca de un id enviado por el cliente.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comentario?: string;
}
