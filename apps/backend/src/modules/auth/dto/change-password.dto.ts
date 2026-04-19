import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  passwordActual!: string;

  @IsString()
  @MinLength(8)
  passwordNueva!: string;
}
