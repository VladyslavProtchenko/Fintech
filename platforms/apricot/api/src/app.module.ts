import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createAuthModule } from '@fintech/shared-auth';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BalanceModule } from './balance/balance.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    PrismaModule,
    createAuthModule(),
    AuthModule,
    BalanceModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
