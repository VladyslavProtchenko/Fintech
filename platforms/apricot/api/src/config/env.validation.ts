import { IsString, IsUrl } from 'class-validator';
import {
  BaseEnvironmentVariables,
  createValidator,
} from '@fintech/shared-config';

class EnvironmentVariables extends BaseEnvironmentVariables {
  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN!: string;

  @IsUrl({ require_tld: false })
  PAYMENT_API_URL!: string;

  @IsString()
  PAYMENT_API_KEY!: string;

  @IsString()
  PLATFORM_ID!: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;
}

export const validate = createValidator(EnvironmentVariables);
