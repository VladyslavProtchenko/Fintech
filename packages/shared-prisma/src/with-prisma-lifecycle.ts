import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';

type PrismaConstructor = new (...args: any[]) => {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
};

export function withPrismaLifecycle<T extends PrismaConstructor>(Base: T) {
  abstract class Mixed extends Base implements OnModuleInit, OnModuleDestroy {
    async onModuleInit(): Promise<void> {
      await this.$connect();
    }

    async onModuleDestroy(): Promise<void> {
      await this.$disconnect();
    }
  }
  return Mixed;
}
