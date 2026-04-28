import { unlink } from 'fs/promises';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '../../generated/prisma/client';
import { AppLogger } from '@fintech/shared-logger';
import { PrismaService } from '../prisma/prisma.service';
import { TextMergeService } from './services/text-merge.service';

const CTX = 'OcrResultsProcessor';

interface OcrResultJobData {
  photoId: string;
  source: 'paddle' | 'surya';
  raw_text: string;
  data: Record<string, unknown>;
}

@Processor('ocr-results')
export class OcrResultsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly textMerge: TextMergeService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async onFailed(job: Job<OcrResultJobData>): Promise<void> {
    const { photoId } = job.data;

    this.logger.error('OCR result job failed after all retries', undefined, CTX, {
      photoId,
      source: job.data.source,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
    });

    try {
      await this.prisma.photo.update({
        where: { id: photoId },
        data: { status: 'FAILED' },
      });
    } catch (err) {
      this.logger.error('Failed to mark photo as FAILED in onFailed hook', err instanceof Error ? err : undefined, CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async process(job: Job<OcrResultJobData>): Promise<void> {
    const { photoId, source, raw_text, data } = job.data;

    this.logger.log('OCR result received', CTX, {
      photoId,
      source,
      jobId: job.id,
      textLength: raw_text.length,
    });

    try {
      const [, resultCount] = await this.prisma.$transaction([
        this.prisma.ocrResult.create({
          data: {
            photoId,
            source,
            rawText: raw_text,
            data: data as Prisma.InputJsonValue,
          },
        }),
        this.prisma.ocrResult.count({ where: { photoId } }),
      ]);

      this.logger.log('OCR result saved', CTX, {
        photoId,
        source,
        resultCount,
        waitingFor: resultCount < 2 ? (source === 'paddle' ? 'surya' : 'paddle') : null,
      });

      if (resultCount >= 2) {
        await this.mergeAndComplete(photoId);
      }
    } catch (err) {
      this.logger.error('Failed to save OCR result', err instanceof Error ? err : undefined, CTX, {
        photoId,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async mergeAndComplete(photoId: string): Promise<void> {
    this.logger.log('Both engines done — starting merge', CTX, { photoId });

    let results: Awaited<ReturnType<typeof this.prisma.ocrResult.findMany>>;
    try {
      results = await this.prisma.ocrResult.findMany({
        where: { photoId },
        orderBy: { createdAt: 'asc' },
      });
    } catch (err) {
      this.logger.error('Failed to fetch OCR results for merge', err instanceof Error ? err : undefined, CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const paddleText =
      results.find((r) => r.source === 'paddle')?.rawText ?? '';
    const suryaText = results.find((r) => r.source === 'surya')?.rawText ?? '';

    let merged: Awaited<ReturnType<typeof this.textMerge.merge>>;
    try {
      merged = await this.textMerge.merge(paddleText, suryaText);
    } catch (err) {
      this.logger.error('Text merge failed', err instanceof Error ? err : undefined, CTX, {
        photoId,
        paddleLength: paddleText.length,
        suryaLength: suryaText.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    try {
      // If fraud analysis already finished and found issues, respect its verdict.
      // Using .catch(() => null) so a transient DB error here never aborts the OCR merge —
      // fraud processor's own updateMany will correct the status if needed.
      const existingFraud = await this.prisma.fraudAnalysis
        .findUnique({ where: { photoId }, select: { verdict: true } })
        .catch(() => null);
      const photoStatus =
        existingFraud && existingFraud.verdict !== 'CLEAN' ? 'FLAGGED' : 'COMPLETED';

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
          data: { status: photoStatus },
        }),
      ]);

      this.logger.log('Photo merge completed', CTX, {
        photoId,
        strategy: merged.strategy,
        confidence: merged.confidenceScore.toFixed(2),
        selectedSource: merged.selectedSource,
        mergedTextLength: merged.mergedText.length,
        status: photoStatus,
      });

      await this.cleanupFile(photoId);
    } catch (err) {
      // MergedOcrResult.photoId is @unique — race condition: both results arrived simultaneously
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn('Merge skipped — already done by parallel job (race condition)', CTX, { photoId });
        return;
      }

      this.logger.error('Failed to persist merge result', err instanceof Error ? err : undefined, CTX, {
        photoId,
        strategy: merged.strategy,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
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
        this.logger.debug('Original file deleted after merge', CTX, {
          photoId,
          path: photo.originalPath,
        });
      }
    } catch (err) {
      this.logger.warn('Failed to delete original file after merge', CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
