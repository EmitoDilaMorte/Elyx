import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class GenerarReciboDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idPago!: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  urlPdf?: string;
}
