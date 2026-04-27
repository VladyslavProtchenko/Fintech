import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PhoneModule } from './phone/phone.module';
import { ProvidersModule } from './providers/providers.module';
import { ChannelsModule } from './channels/channels.module';
import { HealthModule } from './health/health.module';
import { OtpModule } from './otp/otp.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    RedisModule,
    PhoneModule,
    ProvidersModule,
    ChannelsModule,
    HealthModule,
    OtpModule,
    WebhooksModule,
    MonitoringModule,
  ],
})
export class AppModule {}
