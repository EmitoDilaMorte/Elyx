import { IsString, Length } from 'class-validator';

export class MfaCodeDto {
  @IsString()
  @Length(6, 14)
  codigo!: string;
}
