import { IsEmail, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WireDto {
  @ApiProperty({ example: 'friend@example.com' })
  @IsEmail()
  recipient!: string;

  @ApiProperty({ example: '50' })
  @IsNumberString()
  amount!: string;
}
