import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsString, Min, Max } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class BaseEnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST: string = 'localhost';

  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : value))
  @IsNumber()
  @Min(1)
  @Max(65535)
  REDIS_PORT: number = 6379;
}
