import { IsString, Length } from 'class-validator';

export class MfaResendDto {
  @IsString()
  @Length(8, 64)
  challengeId!: string;
}
