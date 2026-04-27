import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProvidersModule } from '../providers/providers.module';
import { ChannelsModule } from '../channels/channels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MonitoringService } from './monitoring.service';
import { DlrTimeoutService } from './dlr-timeout.service';
import { MonitoringController } from './monitoring.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ProvidersModule,
    ChannelsModule,
    PrismaModule,
  ],
  providers: [MonitoringService, DlrTimeoutService],
  controllers: [MonitoringController],
})
export class MonitoringModule {}
