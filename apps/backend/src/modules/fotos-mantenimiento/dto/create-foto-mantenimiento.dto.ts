import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFotoMantenimientoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idReporte!: number;

  @IsString()
  @IsIn(['REPORTE', 'RESOLUCION'])
  tipo!: 'REPORTE' | 'RESOLUCION';

  @IsOptional()
  @IsString()
  @MinLength(3)
  nombreArchivo?: string;
}
