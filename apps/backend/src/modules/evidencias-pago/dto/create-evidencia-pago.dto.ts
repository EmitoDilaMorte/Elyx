import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateEvidenciaPagoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPago!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  nombreArchivo?: string;
}
