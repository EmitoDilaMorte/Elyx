import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateEvidenciaPagoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCondominio!: number;

  /**
   * Pago ya declarado al que pertenece el comprobante.
   *
   * Es excluyente con `idCargo`: o la evidencia respalda un pago registrado, o
   * respalda una transferencia que aun espera conciliarse.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPago?: number;

  /**
   * Cargo en linea (referencia SPEI) al que pertenece el comprobante.
   *
   * Se usa cuando el condomino ya genero su referencia y sube la foto de la
   * transferencia: la evidencia queda visible en la transferencia por
   * conciliar del administrador, sin crear un pago aparte.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCargo?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  nombreArchivo?: string;
}
