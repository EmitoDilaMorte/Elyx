import { Type } from 'class-transformer';
import {
  IsBoolean,
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

/**
 * Actualizacion de la configuracion de cobro del condominio.
 *
 * Todo es opcional: el administrador puede cambiar solo la CLABE o solo el
 * interruptor de MSI. Los metodos son banderas independientes: activar SPEI no
 * apaga la tarjeta ni al reves. La validacion cruzada (la CLABE para SPEI, el
 * RFC y la pagina publica para Stripe) vive en el servicio.
 */
export class ActualizarConfiguracionCobroDto {
  /** Ofrecer transferencia SPEI. Exige una CLABE valida. */
  @IsOptional()
  @IsBoolean()
  speiActivo?: boolean;

  /** Ofrecer pago con tarjeta. Exige la cuenta Connect y sus requisitos. */
  @IsOptional()
  @IsBoolean()
  stripeActivo?: boolean;

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

  /**
   * Datos publicos del condominio.
   *
   * Son requisito del cobro con tarjeta: Stripe exige que la URL del negocio
   * muestre la descripcion de los servicios y datos de contacto de atencion al
   * cliente, y la revisa periodicamente. Se editan desde este panel porque sin
   * ellos no se puede crear la cuenta conectada.
   */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  descripcionPublica?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @IsEmail({}, { message: 'El correo de contacto no es valido.' })
  correoContacto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^[+]?[\d\s()-]{7,30}$/, {
    message: 'El telefono de contacto debe tener al menos 7 digitos.',
  })
  telefonoContacto?: string;

  @IsOptional()
  @IsBoolean()
  paginaPublicaActiva?: boolean;
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

/**
 * Eleccion del metodo con el que se paga una cuota.
 *
 * El cargo se crea aqui y no al abrir el modal: con SPEI y tarjeta activos, un
 * solo cargo PENDIENTE por cuota (indice unico parcial) impediria ofrecer el
 * otro metodo si se creara uno de entrada.
 */
export class CrearCargoMetodoDto extends CrearCargoDto {
  @IsString()
  @IsIn(['SPEI', 'STRIPE'])
  metodo!: 'SPEI' | 'STRIPE';
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
