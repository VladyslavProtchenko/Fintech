import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass1!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Yuki Tanaka' })
  @IsString()
  @MinLength(2)
  name!: string;
}
