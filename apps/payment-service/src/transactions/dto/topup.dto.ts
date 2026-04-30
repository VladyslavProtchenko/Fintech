import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class TopupDto {
  @ApiProperty({ example: 'uuid-of-client' })
  @IsUUID()
  clientId!: string;

  @ApiProperty({ example: '100.00', description: 'Positive USD amount, up to 4 decimal places' })
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'amount must be a positive number with up to 4 decimal places' })
  amount!: string;

  @ApiProperty({ example: 'unique-key-to-prevent-duplicates' })
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}
