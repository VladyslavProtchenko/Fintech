import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, IsUrl, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
}

class EnvVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  PORT: number = 3020;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  ANTHROPIC_API_KEY!: string;

  @IsUrl({ require_tld: false })
  PAYMENT_API_URL!: string;

  @IsString()
  PAYMENT_API_KEY!: string;

  @IsString()
  PLATFORMS_DIR!: string;

  @IsUrl({ require_tld: false })
  CADDY_ADMIN_URL!: string;
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
