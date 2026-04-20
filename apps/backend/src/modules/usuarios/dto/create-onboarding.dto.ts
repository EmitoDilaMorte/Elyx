import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class OnboardingPersonaDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsString()
  @MinLength(2)
  apellidoPaterno!: string;

  @IsOptional()
  @IsString()
  apellidoMaterno?: string;

  @IsEmail()
  correo!: string;
}

class OnboardingCondominoDto extends OnboardingPersonaDto {
  @IsString()
  @MinLength(1)
  claveUnidad!: string;

  @IsString()
  @IsIn(['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'])
  tipoUnidad!: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
}

class OnboardingUnidadDto {
  @IsString()
  @MinLength(1)
  claveUnidad!: string;

  @IsString()
  @IsIn(['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'])
  tipoUnidad!: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
}

export class CreateOnboardingDto {
  @IsString()
  @MinLength(3)
  nombreCondominio!: string;

  @IsOptional()
  @IsString()
  direccionCondominio?: string;

  @IsString()
  @MinLength(2)
  nombreAdmin!: string;

  @IsString()
  @MinLength(2)
  apellidoPaternoAdmin!: string;

  @IsOptional()
  @IsString()
  apellidoMaternoAdmin?: string;

  @IsEmail()
  correoAdmin!: string;

  @IsString()
  @MinLength(2)
  nombreCondomino!: string;

  @IsString()
  @MinLength(2)
  apellidoPaternoCondomino!: string;

  @IsOptional()
  @IsString()
  apellidoMaternoCondomino?: string;

  @IsEmail()
  correoCondomino!: string;

  @IsString()
  @MinLength(1)
  claveUnidadCondomino!: string;

  @IsString()
  @IsIn(['CASA', 'DEPARTAMENTO', 'LOCAL', 'OTRO'])
  tipoUnidadCondomino!: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingPersonaDto)
  admins?: OnboardingPersonaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingCondominoDto)
  condominos?: OnboardingCondominoDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  idUnidadExistenteCondomino?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoCuotaInicial!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  diaLimitePago!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  recargoFijoPorDia!: number;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodoAplicacionInicial!: string;

  @IsDateString()
  fechaInicioCobro!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingUnidadDto)
  unidades!: OnboardingUnidadDto[];
}
