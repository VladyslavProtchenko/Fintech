import { DynamicModule, Global, Module } from '@nestjs/common';
import { AppLogger } from './logger.service';
import { LOGGER_OPTIONS } from './logger.constants';
import { LoggerModuleOptions } from './logger.interfaces';

@Global()
@Module({})
export class LoggerModule {
  static forRoot(options: LoggerModuleOptions): DynamicModule {
    return {
      module: LoggerModule,
      global: true,
      providers: [
        { provide: LOGGER_OPTIONS, useValue: options },
        AppLogger,
      ],
      exports: [AppLogger],
    };
  }
}
