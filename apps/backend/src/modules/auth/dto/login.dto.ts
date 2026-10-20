import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  correo!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /**
   * Cookie persistente ("mantener sesion iniciada"). Si es `false`, el refresh
   * token vive solo lo que dure la sesion del navegador.
   */
  @IsOptional()
  @IsBoolean()
  recordarme?: boolean;

  /**
   * Token de Cloudflare Turnstile. Se marca opcional para no romper clientes
   * antiguos; el TurnstileGuard es quien exige su presencia y validez.
   */
  @IsOptional()
  @IsString()
  captchaToken?: string;

  /** Segmento de la operacion matematica (segundo CAPTCHA propio). */
  @IsOptional()
  @IsString()
  mathChallengeId?: string;

  @IsOptional()
  @IsString()
  mathAnswer?: string;

  /** Identificador de la sesion de telemetria de comportamiento. */
  @IsOptional()
  @IsString()
  behaviorSessionId?: string;
}
