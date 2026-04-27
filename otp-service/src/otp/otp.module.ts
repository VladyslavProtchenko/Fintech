import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';

@Module({
  imports: [ChannelsModule, PrismaModule],
  providers: [OtpService],
  controllers: [OtpController],
})
export class OtpModule {}
