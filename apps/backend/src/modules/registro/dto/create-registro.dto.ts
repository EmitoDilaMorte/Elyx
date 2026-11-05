import { Type } from 'class-transformer';
import {
  IsEmail,
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

export class CreateRegistroCondominioDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nombreCondominio!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccionCondominio?: string;

  /** Numero de unidades que se generaran y que consumen la licencia. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  numeroUnidades!: number;

  /** Prefijo de las claves generadas: "Depto " + 1..N. */
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

  /** YYYY-MM. Si se omite se usa el mes en curso (o el siguiente si ya vencio). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodoInicial?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombreAdmin!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  apellidoPaternoAdmin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  apellidoMaternoAdmin?: string;

  @IsEmail()
  @MaxLength(150)
  correoAdmin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefonoAdmin?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ReenviarVerificacionDto {
  @IsEmail()
  @MaxLength(150)
  correo!: string;
}

export class VerificarRegistroQueryDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;
}
