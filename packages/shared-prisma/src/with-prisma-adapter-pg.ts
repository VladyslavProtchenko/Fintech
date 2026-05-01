import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

type AnyConstructor = new (...args: never[]) => {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
};

/**
 * Mixin that wires up @prisma/adapter-pg lifecycle for a generated PrismaClient.
 *
 * Usage:
 *   import { PrismaClient } from '../generated/prisma/client';
 *   export class PrismaService extends withPrismaAdapterPg(PrismaClient) {}
 *
 * Required env: DATABASE_URL
 */
export function withPrismaAdapterPg<T extends AnyConstructor>(Base: T) {
  @Injectable()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class PrismaAdapterService extends (Base as any) implements OnModuleInit, OnModuleDestroy {
    private readonly pool: Pool;

    constructor() {
      const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
      const adapter = new PrismaPg(pool);
      super({ adapter });
      this.pool = pool;
    }

    async onModuleInit(): Promise<void> {
      await this.$connect();
    }

    async onModuleDestroy(): Promise<void> {
      await this.$disconnect();
      await this.pool.end();
    }
  }

  return PrismaAdapterService as unknown as new () => InstanceType<T> &
    OnModuleInit &
    OnModuleDestroy;
}
