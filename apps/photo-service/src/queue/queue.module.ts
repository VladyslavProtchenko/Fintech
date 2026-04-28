import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DEFAULT_JOB_OPTIONS } from '@fintech/shared-queue';
import { OcrProcessor } from './ocr.processor';
import { OcrResultsProcessor } from './ocr-results.processor';
import { GpuFallbackService } from './gpu-fallback.service';
import { GeminiOcrService } from './services/gemini-ocr.service';
import { TextMergeService } from './services/text-merge.service';
import { UploadModule } from '../upload/upload.module';

const GPU_TIMEOUT = 120_000; // 2 minutes

const gpuJobOptions = {
  ...DEFAULT_JOB_OPTIONS,
  timeout: GPU_TIMEOUT,
};

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'ocr', defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: 'ocr-paddle', defaultJobOptions: gpuJobOptions },
      { name: 'ocr-surya', defaultJobOptions: gpuJobOptions },
      { name: 'ocr-results', defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),
    UploadModule,
  ],
  providers: [
    OcrProcessor,
    OcrResultsProcessor,
    GpuFallbackService,
    GeminiOcrService,
    TextMergeService,
  ],
  exports: [BullModule],
})
export class QueueModule {}
