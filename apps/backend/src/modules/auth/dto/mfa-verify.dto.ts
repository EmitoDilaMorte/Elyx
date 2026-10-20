import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { MfaMetodo } from '../mfa.service';

export class MfaVerifyDto {
  @IsString()
  @Length(8, 64)
  challengeId!: string;

  @IsString()
  @Length(6, 14)
  codigo!: string;

  @IsOptional()
  @IsIn(['TOTP', 'EMAIL'])
  metodo?: MfaMetodo;
}
