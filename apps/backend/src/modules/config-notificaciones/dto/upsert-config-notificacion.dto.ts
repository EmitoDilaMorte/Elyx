import { IsBoolean, IsInt, Min } from 'class-validator';

export class UpsertConfigNotificacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominio!: number;

  @IsInt()
  @Min(0)
  diasAntes!: number;

  @IsInt()
  @Min(0)
  diasDespues!: number;

  @IsBoolean()
  usarEmail!: boolean;

  @IsBoolean()
  usarInterna!: boolean;

  @IsBoolean()
  activo!: boolean;
}
