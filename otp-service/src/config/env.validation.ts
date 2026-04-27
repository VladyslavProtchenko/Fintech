import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @Min(1)
  @Max(65535)
  REDIS_PORT: number = 6379;

  // Provider keys — all optional, provider activates when key is set
  @IsString()
  @IsOptional()
  FAST2SMS_API_KEY?: string;

  @IsString()
  @IsOptional()
  FAST2SMS_ROUTE: string = 'q';

  @IsString()
  @IsOptional()
  FAST2SMS_SENDER_ID: string = 'FSTSMS';

  @IsString()
  @IsOptional()
  FAST2SMS_DLT_TEMPLATE_ID?: string;

  @IsString()
  @IsOptional()
  MSG91_AUTH_KEY?: string;

  @IsString()
  @IsOptional()
  MSG91_SMS_TEMPLATE_ID?: string;

  @IsString()
  @IsOptional()
  MSG91_WHATSAPP_TEMPLATE_ID?: string;

  @IsString()
  @IsOptional()
  TWILIO_ACCOUNT_SID?: string;

  @IsString()
  @IsOptional()
  TWILIO_AUTH_TOKEN?: string;

  @IsString()
  @IsOptional()
  TWILIO_FROM_NUMBER?: string;

  @IsString()
  @IsOptional()
  TWILIO_WHATSAPP_FROM?: string;

  @IsString()
  @IsOptional()
  TWILIO_VOICE_FROM?: string;

  // OTP Config
  @IsNumber()
  @IsOptional()
  OTP_LENGTH: number = 6;

  @IsNumber()
  @IsOptional()
  OTP_TTL_SECONDS: number = 300;

  @IsNumber()
  @IsOptional()
  OTP_MAX_ATTEMPTS: number = 3;

  @IsNumber()
  @IsOptional()
  OTP_RATE_LIMIT_PER_10MIN: number = 5;

  @IsNumber()
  @IsOptional()
  OTP_RATE_LIMIT_PER_HOUR: number = 10;

  @IsNumber()
  @IsOptional()
  OTP_COOLDOWN_SECONDS: number = 30;

  @IsNumber()
  @IsOptional()
  OTP_IP_RATE_LIMIT_PER_10MIN: number = 20;

  // DLR Config
  @IsNumber()
  @IsOptional()
  DLR_TIMEOUT_MS: number = 10000;

  @IsString()
  @IsOptional()
  DLR_WEBHOOK_BASE_URL?: string;

  // Monitoring
  @IsNumber()
  @IsOptional()
  ALERT_DELIVERY_RATE_THRESHOLD: number = 0.95;

  @IsString()
  @IsOptional()
  ALERT_WEBHOOK_URL?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
