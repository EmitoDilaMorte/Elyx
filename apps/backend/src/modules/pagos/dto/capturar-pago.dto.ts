import { IsInt, Min } from 'class-validator';

export class CapturarPagoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idCuota!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioPaga!: number;
}