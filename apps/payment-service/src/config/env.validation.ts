import { IsString } from 'class-validator';
import { BaseEnvironmentVariables, createValidator } from '@fintech/shared-config';

class PaymentEnvironmentVariables extends BaseEnvironmentVariables {
  PORT: number = 3004;

  @IsString()
  API_KEY!: string;
}

export const validate = createValidator(PaymentEnvironmentVariables);
