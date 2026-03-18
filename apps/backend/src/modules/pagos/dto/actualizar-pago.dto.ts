import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class AprobarPagoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idPago!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;
}

export class RechazarPagoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idPago!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  @IsString()
  @MinLength(5)
  motivoRechazo!: string;
}