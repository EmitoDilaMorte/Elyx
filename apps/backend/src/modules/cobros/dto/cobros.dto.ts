import { Type } from 'class-transformer';
import {
  IsBoolean,
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

/**
 * Actualizacion de la configuracion de cobro del condominio.
 *
 * Todo es opcional: el administrador puede cambiar solo la CLABE o solo el
 * interruptor de MSI. `metodo` es lo que decide que campos se exigen, y esa
 * validacion cruzada vive en el servicio (aqui no se puede expresar bien con
 * class-validator sin duplicar reglas).
 */
export class ActualizarConfiguracionCobroDto {
  @IsOptional()
  @IsString()
  @IsIn(['NINGUNO', 'SPEI', 'STRIPE_CONNECT'])
  metodo?: 'NINGUNO' | 'SPEI' | 'STRIPE_CONNECT';

  /** CLABE de 18 digitos. El digito verificador se valida en el servicio. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{18}$/, {
    message: 'La CLABE debe tener exactamente 18 digitos.',
  })
  clabe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  banco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  beneficiario?: string;

  /**
   * Prefijo de la referencia SPEI (ej. `JAR`). Se normaliza a mayusculas y solo
   * admite letras y digitos: la referencia viaja en el concepto de una
   * transferencia bancaria y debe ser facil de transcribir.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'El prefijo solo admite letras y numeros, sin espacios ni simbolos.',
  })
  referenciaPrefijo?: string;

  @IsOptional()
  @IsBoolean()
  permitirMsi?: boolean;

  /** Comision estimada de Stripe, solo para mostrar el costo en el panel. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  comisionTasa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  comisionFijo?: number;
}

/** Cuerpo para crear el cargo de una cuota. */
export class CrearCargoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCuota!: number;
}

/** Conciliacion manual de un cargo SPEI (el administrador lo marca pagado). */
export class ConfirmarCargoSpeiDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCargo!: number;

  /** Referencia que aparece en el estado de cuenta del banco (opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referenciaBancaria?: string;
}
