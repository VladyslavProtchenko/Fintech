import { IsString, MinLength } from 'class-validator';
import { BaseEnvironmentVariables, createValidator } from '@fintech/shared-config';

export class EnvironmentVariables extends BaseEnvironmentVariables {
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN: string = '7d';

  @IsString()
  @MinLength(1)
  PAYMENT_API_URL!: string;

  @IsString()
  @MinLength(1)
  PAYMENT_API_KEY!: string;

  @IsString()
  @MinLength(1)
  PLATFORM_ID!: string;

  @IsString()
  FRONTEND_URL!: string;
}

export const validate = createValidator(EnvironmentVariables);
