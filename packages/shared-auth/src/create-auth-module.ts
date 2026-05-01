import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Creates a global auth module with JWT + Passport configured from env.
 * Import once in AppModule — JwtAuthGuard and CurrentUser are then available globally.
 *
 * Required env vars: JWT_SECRET, JWT_EXPIRES_IN (optional, default '7d')
 */
export function createAuthModule(): DynamicModule {
  @Global()
  @Module({})
  class AuthModule {}

  return {
    module: AuthModule,
    imports: [
      ConfigModule,
      PassportModule,
      JwtModule.registerAsync({
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          secret: config.getOrThrow<string>('JWT_SECRET'),
        }),
        inject: [ConfigService],
      }),
    ],
    providers: [JwtStrategy, JwtAuthGuard],
    exports: [JwtModule, JwtStrategy, JwtAuthGuard],
  };
}
