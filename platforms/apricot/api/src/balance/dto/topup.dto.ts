import { IsNumberString } from 'class-validator';

export class TopupDto {
  @IsNumberString()
  amount!: string;
}
