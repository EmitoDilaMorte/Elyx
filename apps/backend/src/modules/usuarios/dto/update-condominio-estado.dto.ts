import { IsIn } from 'class-validator';

const ESTADOS = ['ACTIVO', 'INACTIVO'] as const;

export class UpdateCondominioEstadoDto {
  @IsIn(ESTADOS)
  estado!: (typeof ESTADOS)[number];
}
