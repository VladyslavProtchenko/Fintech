import { DynamicModule, Module, Type } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

export function createHealthModule(Controller: Type, options?: { imports?: any[] }): DynamicModule {
  @Module({})
  class HealthModule {}

  return {
    module: HealthModule,
    imports: [TerminusModule.forRoot(), ...(options?.imports ?? [])],
    controllers: [Controller],
  };
}
