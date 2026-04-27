import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OcrProcessor } from './ocr.processor';
import { OcrResultsProcessor } from './ocr-results.processor';
import { GpuFallbackService } from './gpu-fallback.service';
import { GeminiOcrService } from './services/gemini-ocr.service';
import { TextMergeService } from './services/text-merge.service';
import { UploadModule } from '../upload/upload.module';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

const GPU_TIMEOUT = 120_000; // 2 minutes

const gpuJobOptions = {
  ...defaultJobOptions,
  timeout: GPU_TIMEOUT,
};

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'ocr', defaultJobOptions },
      { name: 'ocr-paddle', defaultJobOptions: gpuJobOptions },
      { name: 'ocr-surya', defaultJobOptions: gpuJobOptions },
      { name: 'ocr-results', defaultJobOptions },
    ),
    UploadModule,
  ],
  providers: [OcrProcessor, OcrResultsProcessor, GpuFallbackService, GeminiOcrService, TextMergeService],
  exports: [BullModule],
})
export class QueueModule {}
