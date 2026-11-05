import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export const ROLES_PROPUESTOS = ['ADMINISTRADOR', 'CONDOMINO'] as const;

export class CreateCambioRolVotacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominioAdmin!: number;

  /** Miembro sobre el que se propone el cambio de rol. */
  @IsInt()
  @Min(1)
  idUsuarioCondominioObjetivo!: number;

  @IsString()
  @IsIn(ROLES_PROPUESTOS)
  rolPropuesto!: (typeof ROLES_PROPUESTOS)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  motivo!: string;

  /** ISO date opcional; por defecto, 7 dias. */
  @IsOptional()
  @IsString()
  fechaFin?: string;
}
