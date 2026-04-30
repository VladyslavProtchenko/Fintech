import { IsNumberString } from 'class-validator';

export class TopupDto {
  @IsNumberString()
  value!: string;
}
