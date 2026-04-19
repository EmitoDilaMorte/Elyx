import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingPersonaDto)
  admins?: OnboardingPersonaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingPersonaDto)
  condominos?: OnboardingPersonaDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  idUnidadExistenteCondomino?: number;
}
