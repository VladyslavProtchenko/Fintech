import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import {
  BaseEnvironmentVariables,
  createValidator,
} from '@fintech/shared-config';

class OtpEnvironmentVariables extends BaseEnvironmentVariables {
  PORT: number = 3001;

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
  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_LENGTH: number = 6;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_TTL_SECONDS: number = 300;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_MAX_ATTEMPTS: number = 3;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_RATE_LIMIT_PER_10MIN: number = 5;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_RATE_LIMIT_PER_HOUR: number = 10;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_COOLDOWN_SECONDS: number = 30;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  OTP_IP_RATE_LIMIT_PER_10MIN: number = 20;

  // DLR Config
  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @IsOptional()
  DLR_TIMEOUT_MS: number = 10000;

  @IsString()
  @IsOptional()
  DLR_WEBHOOK_BASE_URL?: string;

  // Admin
  @IsString()
  @IsOptional()
  ADMIN_API_KEY?: string;

  // Monitoring
  @Transform(({ value }) => (value != null ? parseFloat(String(value)) : value))
  @IsNumber()
  @IsOptional()
  ALERT_DELIVERY_RATE_THRESHOLD: number = 0.95;

  @IsString()
  @IsOptional()
  ALERT_WEBHOOK_URL?: string;
}

export const validate = createValidator(OtpEnvironmentVariables);
