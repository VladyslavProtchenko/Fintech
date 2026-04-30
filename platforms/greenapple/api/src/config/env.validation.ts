import { IsEnum, IsInt, IsString, MinLength } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvConfig {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @IsInt()
  PORT!: number;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN!: string;

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
