import { IsNumberString } from 'class-validator';

export class DepositDto {
  @IsNumberString()
  amount!: string;
}
