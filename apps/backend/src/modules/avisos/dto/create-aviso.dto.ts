import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateAvisoDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  @IsString()
  @MinLength(5)
  titulo!: string;

  @IsString()
  @MinLength(10)
  contenido!: string;

  /**
   * Ademas de la notificacion interna y el push, manda el aviso por correo.
   * Apagado por defecto: un aviso a 200 unidades son 200 correos.
   */
  @IsOptional()
  @IsBoolean()
  enviarPorCorreo?: boolean;
}