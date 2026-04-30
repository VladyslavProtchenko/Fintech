import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule, TraceMiddleware } from '@fintech/shared-logger';
import { createPrismaModule } from '@fintech/shared-prisma';
import { validate } from './config/env.validation';
import { PrismaService } from './prisma/prisma.service';
import { ApiKeyGuard } from './common/api-key.guard';
import { HealthModule } from './health/health.module';
import { ClientsModule } from './clients/clients.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule.forRoot({ serviceName: 'payment-service' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 50 }]),
    createPrismaModule(PrismaService),
    HealthModule,
    ClientsModule,
    TransactionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
