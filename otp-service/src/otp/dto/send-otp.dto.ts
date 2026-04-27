import { IsString, IsOptional, IsIP } from 'class-validator';

export class SendOtpDto {
  @IsString()
  phone!: string;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}
