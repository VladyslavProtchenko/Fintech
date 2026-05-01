import { IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechargeDto {
  @ApiProperty({ example: '100' })
  @IsNumberString()
  amount!: string;
}
