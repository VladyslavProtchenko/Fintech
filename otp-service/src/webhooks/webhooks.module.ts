import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DlrService } from './dlr.service';
import { DlrController } from './dlr.controller';

@Module({
  imports: [PrismaModule],
  providers: [DlrService],
  controllers: [DlrController],
})
export class WebhooksModule {}
