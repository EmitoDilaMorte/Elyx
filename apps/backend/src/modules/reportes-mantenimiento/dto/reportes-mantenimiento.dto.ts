import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';

export enum ReporteMantenimientoEstado {
  NUEVO = 'NUEVO',
  EN_PROCESO = 'EN_PROCESO',
  RESUELTO = 'RESUELTO',
}

export class CreateReporteMantenimientoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioReporta!: number;

  @IsString()
  @MinLength(3)
  unidad!: string;

  @IsString()
  @MinLength(5)
  descripcion!: string;
}

export class UpdateReporteMantenimientoEstadoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idReporte!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  @IsEnum(ReporteMantenimientoEstado)
  estado!: ReporteMantenimientoEstado;
}