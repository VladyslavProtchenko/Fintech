import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUrl, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  PORT: number = 3020;

  @IsString()
  DATABASE_URL!: string;

  @IsUrl({ require_tld: false })
  PAYMENT_API_URL!: string;

  @IsString()
  PAYMENT_API_KEY!: string;

  @IsString()
  PLATFORMS_DIR!: string;

  // Admin connection to the shared postgres server (used to CREATE DATABASE for each platform)
  // Must point to the admin user with CREATE DATABASE privileges, database = "postgres"
  // Local: postgresql://<user>@localhost:5432/postgres
  // Docker: postgresql://postgres:postgres@postgres:5432/postgres
  @IsString()
  POSTGRES_ADMIN_URL!: string;

  // Optional — Caddy integration is not yet implemented
  @IsOptional()
  @IsUrl({ require_tld: false })
  CADDY_ADMIN_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
