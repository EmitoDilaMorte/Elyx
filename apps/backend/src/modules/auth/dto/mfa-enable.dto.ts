import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { MfaCanal } from '../mfa.service';

export class MfaEnableDto {
  @IsString()
  @Length(6, 14)
  codigo!: string;

  @IsOptional()
  @IsIn(['TOTP', 'EMAIL', 'AMBOS'])
  canal?: MfaCanal;
}
