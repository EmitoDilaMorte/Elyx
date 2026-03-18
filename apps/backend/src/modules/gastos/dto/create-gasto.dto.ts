import { IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateGastoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsString()
  @MinLength(3)
  concepto!: string;

  @IsString()
  @MinLength(3)
  categoria!: string;

  @IsNumber()
  @Min(0.01)
  monto!: number;
}