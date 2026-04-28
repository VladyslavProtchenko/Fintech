import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProvidersModule } from '../providers/providers.module';
import { ChannelsModule } from '../channels/channels.module';
import { MonitoringService } from './monitoring.service';
import { DlrTimeoutService } from './dlr-timeout.service';
import { MonitoringController } from './monitoring.controller';
import { AdminGuard } from '../common/guards/admin.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ProvidersModule,
    ChannelsModule,
  ],
  providers: [MonitoringService, DlrTimeoutService, AdminGuard],
  controllers: [MonitoringController],
})
export class MonitoringModule {}
