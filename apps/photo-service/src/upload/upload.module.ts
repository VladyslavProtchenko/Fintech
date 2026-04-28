import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UploadController } from './upload.controller';
import { FileValidatorService } from './services/file-validator.service';
import { ImageProcessorService } from './services/image-processor.service';
import { DedupService } from './services/dedup.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'ocr' })],
  controllers: [UploadController],
  providers: [FileValidatorService, ImageProcessorService, DedupService],
  exports: [ImageProcessorService],
})
export class UploadModule {}
