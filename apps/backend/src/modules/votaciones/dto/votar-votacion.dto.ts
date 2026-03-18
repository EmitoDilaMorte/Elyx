import { IsEnum, IsInt, Min } from 'class-validator';
import { VotoOpcion } from '../../../common/enums/voto-opcion.enum';

export class VotarVotacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idVotacion!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominio!: number;

  @IsEnum(VotoOpcion)
  opcion!: VotoOpcion;
}