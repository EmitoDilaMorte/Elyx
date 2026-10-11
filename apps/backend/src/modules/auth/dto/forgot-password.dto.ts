import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  correo!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
