import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  correo!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /**
   * Token de Cloudflare Turnstile. Se marca opcional para no romper clientes
   * antiguos; el TurnstileGuard es quien exige su presencia y validez.
   */
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
