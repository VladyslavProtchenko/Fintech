import { DynamicModule, Type } from '@nestjs/common';

export function createPrismaModule(PrismaService: Type): DynamicModule {
  class PrismaModule {}

  return {
    module: PrismaModule,
    global: true,
    providers: [PrismaService],
    exports: [PrismaService],
  };
}
