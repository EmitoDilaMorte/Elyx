import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCambioCuotaVotacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  montoPropuesto!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recargoPropuesto?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  diaLimitePropuesto?: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  motivo?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}

export class EjecutarCambioCuotaDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idVotacion!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;
}
