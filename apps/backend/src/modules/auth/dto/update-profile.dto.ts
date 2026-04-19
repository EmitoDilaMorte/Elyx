import { IsEmail } from 'class-validator';

export class UpdateProfileDto {
  @IsEmail()
  correo!: string;
}
