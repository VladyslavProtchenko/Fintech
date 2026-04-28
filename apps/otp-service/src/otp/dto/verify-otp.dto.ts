import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: '123456', minLength: 4, maxLength: 8 })
  @IsString()
  @Length(4, 8)
  code!: string;
}
