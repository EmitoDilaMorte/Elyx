import { IsInt, IsString, Min, MinLength } from 'class-validator';

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
}