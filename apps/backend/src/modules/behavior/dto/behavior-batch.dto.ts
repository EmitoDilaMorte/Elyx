import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BehaviorEventDto } from './behavior-event.dto';

export class BehaviorBatchDto {
  @IsString()
  @Length(8, 64)
  sessionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ruta?: string;

  /** `navigator.webdriver` tal como lo ve el cliente. */
  @IsOptional()
  @IsBoolean()
  webdriver?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60 * 60 * 1000)
  tiempoFormularioMs?: number;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BehaviorEventDto)
  eventos!: BehaviorEventDto[];
}
