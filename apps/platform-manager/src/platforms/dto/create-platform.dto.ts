import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreatePlatformDto {
  @ApiProperty({ example: 'citrus' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, hyphens only' })
  slug!: string;

  @ApiProperty({ example: 'payment site for Valencia citrus company' })
  @IsString()
  @MinLength(10)
  prompt!: string;

  @ApiPropertyOptional({ example: 'citrus.localhost' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9.-]+$/, { message: 'domain must contain only lowercase letters, numbers, dots, hyphens' })
  domain?: string;
}
