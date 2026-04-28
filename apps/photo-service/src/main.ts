import { mkdirSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppLogger } from '@fintech/shared-logger';
import { GlobalExceptionFilter } from '@fintech/shared-errors';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(AppLogger));
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(AppLogger)));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Photo Service')
    .setDescription('OCR receipt recognition — upload images, get extracted text')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const config = app.get(ConfigService);

  const uploadDir = config.get<string>('UPLOAD_DIR', './uploads');
  mkdirSync(`${uploadDir}/originals`, { recursive: true });
  mkdirSync(`${uploadDir}/processed`, { recursive: true });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
