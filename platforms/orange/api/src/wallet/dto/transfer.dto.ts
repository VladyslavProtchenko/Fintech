import { IsEmail, IsNumberString } from 'class-validator';

export class TransferDto {
  @IsEmail()
  toEmail!: string;

  @IsNumberString()
  value!: string;
}
