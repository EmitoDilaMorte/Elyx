import { IsIn, IsNumber, IsOptional } from 'class-validator';

export const TIPOS_EVENTO = [
  'mousemove',
  'keydown',
  'pointerdown',
  'scroll',
  'visibilitychange',
] as const;

export class BehaviorEventDto {
  @IsIn(TIPOS_EVENTO)
  tipo!: (typeof TIPOS_EVENTO)[number];

  /** Marca de tiempo relativa al inicio de la sesion (ms). */
  @IsNumber()
  t!: number;

  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  /** Delta respecto del evento anterior del mismo tipo (ms). */
  @IsOptional()
  @IsNumber()
  dt?: number;
}
