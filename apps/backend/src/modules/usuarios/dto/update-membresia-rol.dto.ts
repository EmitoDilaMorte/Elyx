import { IsIn } from 'class-validator';

export const ROLES_MEMBRESIA = ['ADMINISTRADOR', 'CONDOMINO'] as const;

export class UpdateMembresiaRolDto {
  @IsIn(ROLES_MEMBRESIA)
  rol!: (typeof ROLES_MEMBRESIA)[number];
}
