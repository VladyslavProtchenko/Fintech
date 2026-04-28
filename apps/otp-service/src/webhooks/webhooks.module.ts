import { Module } from '@nestjs/common';
import { DlrService } from './dlr.service';
import { DlrController } from './dlr.controller';

@Module({
  imports: [],
  providers: [DlrService],
  controllers: [DlrController],
})
export class WebhooksModule {}
