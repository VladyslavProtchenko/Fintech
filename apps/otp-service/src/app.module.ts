import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule, TraceMiddleware } from '@fintech/shared-logger';
import { createPrismaModule } from '@fintech/shared-prisma';
import { createRedisModule } from '@fintech/shared-redis';
import { createHealthModule } from '@fintech/shared-health';
import { validate } from './config/env.validation';
import { PrismaService } from './prisma/prisma.service';
import { HealthController } from './health/health.controller';
import { PhoneModule } from './phone/phone.module';
import { ProvidersModule } from './providers/providers.module';
import { ChannelsModule } from './channels/channels.module';
import { OtpModule } from './otp/otp.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule.forRoot({ serviceName: 'otp-service' }),
    createPrismaModule(PrismaService),
    createRedisModule(),
    PhoneModule,
    ProvidersModule,
    ChannelsModule,
    createHealthModule(HealthController),
    OtpModule,
    WebhooksModule,
    MonitoringModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
