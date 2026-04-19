import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const TIPOS = [
  'RECORDATORIO_ANTES_VENCIMIENTO',
  'RECORDATORIO_DESPUES_VENCIMIENTO',
  'SOLICITUD_CAMBIO_CREADA',
  'SOLICITUD_CAMBIO_APROBADA',
  'SOLICITUD_CAMBIO_RECHAZADA',
  'SOLICITUD_CAMBIO_EJECUTADA',
  'ALTA_INICIAL_USUARIO',
] as const;
const CANALES = ['EMAIL', 'INTERNA'] as const;
const ESTADOS = ['PROGRAMADA', 'ENVIADA', 'FALLIDA', 'LEIDA'] as const;

export class CreateNotificacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominio!: number;

  @IsString()
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @IsString()
  @IsIn(CANALES)
  canal!: (typeof CANALES)[number];

  @IsString()
  @MinLength(3)
  asunto!: string;

  @IsString()
  @MinLength(5)
  mensaje!: string;

  @IsString()
  @MinLength(10)
  fechaProgramada!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  idConfig?: number;
}

export class MarcarNotificacionLeidaDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idNotificacion!: number;
}

export class ListNotificacionesEstadoDto {
  @IsOptional()
  @IsString()
  @IsIn(ESTADOS)
  estado?: (typeof ESTADOS)[number];
}
