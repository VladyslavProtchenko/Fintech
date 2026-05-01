import { IsEmail, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WireDto {
  @ApiProperty({ example: 'friend@example.com' })
  @IsEmail()
  recipientEmail!: string;

  @ApiProperty({ example: '50.00' })
  @IsNumberString()
  sum!: string;
}
