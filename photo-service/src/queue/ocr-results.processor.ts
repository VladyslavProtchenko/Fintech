import { unlink } from 'fs/promises';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TextMergeService } from './services/text-merge.service';

interface OcrResultJobData {
  photoId: string;
  source: 'paddle' | 'surya';
  raw_text: string;
  data: Record<string, unknown>;
}

@Processor('ocr-results')
export class OcrResultsProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrResultsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly textMerge: TextMergeService,
  ) {
    super();
  }

  async onFailed(job: Job<OcrResultJobData>): Promise<void> {
    const { photoId } = job.data;
    this.logger.error(`OCR result job for photo ${photoId} failed after all retries`);
    await this.prisma.photo.update({
      where: { id: photoId },
      data: { status: 'FAILED' },
    });
  }

  async process(job: Job<OcrResultJobData>): Promise<void> {
    const { photoId, source, raw_text, data } = job.data;
    this.logger.log(`Processing OCR result for photo ${photoId} (source=${source})`);

    try {
      const [, resultCount] = await this.prisma.$transaction([
        this.prisma.ocrResult.create({
          data: { photoId, source, rawText: raw_text, data: data as Prisma.InputJsonValue },
        }),
        this.prisma.ocrResult.count({ where: { photoId } }),
      ]);

      this.logger.log(`OCR result saved for photo ${photoId} (source=${source}, total=${resultCount}/2)`);

      if (resultCount >= 2) {
        await this.mergeAndComplete(photoId);
      }
    } catch (error) {
      this.logger.error(`Failed to save OCR result for photo ${photoId}`, error);
      throw error;
    }
  }

  private async mergeAndComplete(photoId: string): Promise<void> {
    const results = await this.prisma.ocrResult.findMany({
      where: { photoId },
      orderBy: { createdAt: 'asc' },
    });

    const paddleText = results.find((r) => r.source === 'paddle')?.rawText ?? '';
    const suryaText = results.find((r) => r.source === 'surya')?.rawText ?? '';

    const merged = await this.textMerge.merge(paddleText, suryaText);

    try {
      await this.prisma.$transaction([
        this.prisma.mergedOcrResult.create({
          data: {
            photoId,
            mergedText: merged.mergedText,
            confidenceScore: merged.confidenceScore,
            mergeStrategy: merged.strategy,
            selectedSource: merged.selectedSource,
          },
        }),
        this.prisma.photo.update({
          where: { id: photoId },
          data: { status: 'COMPLETED' },
        }),
      ]);

      this.logger.log(
        `Photo ${photoId} COMPLETED — strategy=${merged.strategy}, confidence=${merged.confidenceScore.toFixed(2)}`,
      );

      await this.cleanupFile(photoId);
    } catch (error) {
      // MergedOcrResult.photoId is @unique — ignore duplicate if both results raced
      if ((error as { code?: string }).code === 'P2002') {
        this.logger.warn(`Photo ${photoId} merge already done (race condition ignored)`);
        return;
      }
      throw error;
    }
  }

  private async cleanupFile(photoId: string): Promise<void> {
    try {
      const photo = await this.prisma.photo.findUnique({
        where: { id: photoId },
        select: { originalPath: true },
      });

      if (photo?.originalPath) {
        await unlink(photo.originalPath);
        this.logger.log(`Cleaned up file for photo ${photoId}`);
      }
    } catch {
      this.logger.warn(`Failed to cleanup file for photo ${photoId}`);
    }
  }
}
