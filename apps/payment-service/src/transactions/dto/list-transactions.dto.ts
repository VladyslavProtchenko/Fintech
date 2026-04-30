import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TxType } from '../../../generated/prisma/client';

export class ListTransactionsDto {
  @ApiProperty({ example: 'uuid-of-client', description: 'Required — returns transactions for this client only' })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({ enum: TxType })
  @IsOptional()
  @IsEnum(TxType)
  type?: TxType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
