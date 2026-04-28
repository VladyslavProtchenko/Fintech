import { IsOptional, IsString } from 'class-validator';
import {
  BaseEnvironmentVariables,
  createValidator,
} from '@fintech/shared-config';

class PhotoEnvironmentVariables extends BaseEnvironmentVariables {
  PORT: number = 3000;

  @IsString()
  UPLOAD_DIR: string = './uploads';

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;
}

export const validate = createValidator(PhotoEnvironmentVariables);
