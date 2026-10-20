import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
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

  /** Misma preferencia que en el login: cookie persistente o de sesion. */
  @IsOptional()
  @IsBoolean()
  recordarme?: boolean;
}
