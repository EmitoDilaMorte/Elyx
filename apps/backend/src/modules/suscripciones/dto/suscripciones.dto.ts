import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmarPagoSuscripcionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;

  @IsOptional()
  @IsIn(['MANUAL', 'TRANSFERENCIA', 'CHECKOUT'])
  metodo?: 'MANUAL' | 'TRANSFERENCIA' | 'CHECKOUT';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;
}

export class CambiarEstadoSuscripcionDto {
  @IsIn(['ACTIVA', 'PENDIENTE', 'VENCIDA', 'CANCELADA'])
  estado!: 'ACTIVA' | 'PENDIENTE' | 'VENCIDA' | 'CANCELADA';
}
