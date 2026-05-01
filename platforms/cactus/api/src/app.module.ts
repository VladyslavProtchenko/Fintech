import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createAuthModule } from '@fintech/shared-auth';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { UserModule } from './user/user.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    PrismaModule,
    createAuthModule(),
    AuthModule,
    AccountModule,
    UserModule,
    HealthModule,
  ],
})
export class AppModule {}
