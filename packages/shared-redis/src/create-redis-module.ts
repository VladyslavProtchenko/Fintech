import { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '@fintech/shared-logger';
import { REDIS_CLIENT } from './redis.constants';

const CTX = 'RedisModule';

export function createRedisModule(): DynamicModule {
  class RedisModule {}

  return {
    module: RedisModule,
    global: true,
    providers: [
      {
        provide: REDIS_CLIENT,
        useFactory: (config: ConfigService, logger: AppLogger): Redis => {
          const client = new Redis({
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            family: 4, // Force IPv4 — Node.js v25+ resolves localhost to ::1 first
          });

          client.on('connect', () => {
            logger.log('Redis connected', CTX);
          });

          client.on('ready', () => {
            logger.log('Redis ready', CTX);
          });

          client.on('error', (err: Error) => {
            logger.error('Redis connection error', err, CTX, {
              message: err.message,
            });
          });

          client.on('close', () => {
            logger.warn('Redis connection closed', CTX);
          });

          client.on('reconnecting', () => {
            logger.warn('Redis reconnecting', CTX);
          });

          return client;
        },
        inject: [ConfigService, AppLogger],
      },
    ],
    exports: [REDIS_CLIENT],
  };
}
