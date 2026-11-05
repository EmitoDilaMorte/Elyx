import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ActualizarDatosFiscalesDto {
  /** RFC mexicano: 3 (moral) o 4 (fisica) letras + fecha + homoclave. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i, {
    message: 'El RFC no tiene un formato valido.',
  })
  rfc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string;

  /** Clave de regimen del SAT (`cve_regimen`), 3 digitos: 601, 603, 612... */
  @IsOptional()
  @IsString()
  @Matches(/^\d{3}$/, {
    message: 'El regimen fiscal debe ser la clave de 3 digitos del SAT (ej. 603).',
  })
  regimenFiscal?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/, { message: 'El codigo postal debe tener 5 digitos.' })
  cpFiscal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  correoFacturacion?: string;
}

export class SincronizarUnidadesDto {
  @IsInt()
  @Min(1)
  @Max(2000)
  unidades!: number;
}
