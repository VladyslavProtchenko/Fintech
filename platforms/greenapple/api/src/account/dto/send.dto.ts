import { IsEmail, IsNumberString } from 'class-validator';

export class SendDto {
  @IsEmail()
  recipient!: string;

  @IsNumberString()
  amount!: string;
}
