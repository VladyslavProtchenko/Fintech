import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, TraceMiddleware } from '@fintech/shared-logger';
import { createPrismaModule } from '@fintech/shared-prisma';
import { createHealthModule } from '@fintech/shared-health';
import { validate } from './config/env.validation';
import { PrismaService } from './prisma/prisma.service';
import { QueueModule } from './queue/queue.module';
import { HealthController } from './health/health.controller';
import { UploadModule } from './upload/upload.module';
import { ResultsModule } from './results/results.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule.forRoot({ serviceName: 'photo-service' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        },
      }),
    }),
    createPrismaModule(PrismaService),
    QueueModule,
    createHealthModule(HealthController, {
      imports: [BullModule.registerQueue({ name: 'ocr' })],
    }),
    UploadModule,
    ResultsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
