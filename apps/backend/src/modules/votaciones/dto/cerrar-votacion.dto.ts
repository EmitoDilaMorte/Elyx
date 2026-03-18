import { IsInt, Min } from 'class-validator';

export class CerrarVotacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idVotacion!: number;
}