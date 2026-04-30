import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class TransferDto {
  @ApiProperty({ example: 'uuid-of-sender' })
  @IsUUID()
  fromClientId!: string;

  @ApiProperty({ example: 'uuid-of-receiver' })
  @IsUUID()
  toClientId!: string;

  @ApiProperty({ example: '50.00', description: 'Positive USD amount, up to 4 decimal places' })
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'amount must be a positive number with up to 4 decimal places' })
  amount!: string;

  @ApiProperty({ example: 'unique-key-to-prevent-duplicates' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
