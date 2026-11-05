import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const TIPOS_UNIDAD = ['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'] as const;

/**
 * Alta de condominio por un administrador ya autenticado: no pide correo ni
 * contrasena porque la sesion ya prueba la identidad.
 */
export class CreateCondominioAdminDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nombreCondominio!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccionCondominio?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  numeroUnidades!: number;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  prefijoUnidad?: string;

  @IsString()
  @IsIn(TIPOS_UNIDAD)
  tipoUnidad!: (typeof TIPOS_UNIDAD)[number];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoCuota!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recargoPorDia!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  diaLimitePago!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodoInicial?: string;
}
