import { mkdirSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const uploadDir = config.get<string>('UPLOAD_DIR', './uploads');
  mkdirSync(`${uploadDir}/originals`, { recursive: true });
  mkdirSync(`${uploadDir}/processed`, { recursive: true });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap();
