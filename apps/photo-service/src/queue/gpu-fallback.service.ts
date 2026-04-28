import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { unlink } from 'fs/promises';
import { AppLogger } from '@fintech/shared-logger';
import { PrismaService } from '../prisma/prisma.service';

const CTX = 'GpuFallbackService';

@Injectable()
export class GpuFallbackService implements OnModuleInit, OnModuleDestroy {
  private paddleEvents!: QueueEvents;
  private suryaEvents!: QueueEvents;
  private paddleQueue!: Queue;
  private suryaQueue!: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    const connection = {
      host: this.config.get<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT'),
    };

    this.paddleQueue = new Queue('ocr-paddle', { connection });
    this.suryaQueue = new Queue('ocr-surya', { connection });
    this.paddleEvents = new QueueEvents('ocr-paddle', { connection });
    this.suryaEvents = new QueueEvents('ocr-surya', { connection });

    this.paddleEvents.on('failed', ({ jobId }) => {
      void this.onGpuJobFailed(jobId, 'paddle');
    });
    this.suryaEvents.on('failed', ({ jobId }) => {
      void this.onGpuJobFailed(jobId, 'surya');
    });

    this.logger.log('GPU fallback listeners started', CTX);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.all([
        this.paddleEvents.close(),
        this.suryaEvents.close(),
        this.paddleQueue.close(),
        this.suryaQueue.close(),
      ]);
      this.logger.log('GPU fallback listeners closed', CTX);
    } catch (err) {
      this.logger.error('Error closing GPU fallback queues', err instanceof Error ? err : undefined, CTX, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async onGpuJobFailed(
    jobId: string,
    source: 'paddle' | 'surya',
  ): Promise<void> {
    try {
      const queue = source === 'paddle' ? this.paddleQueue : this.suryaQueue;
      const job = await queue.getJob(jobId);

      if (!job) return;

      const { photoId } = job.data as { photoId: string };
      const maxAttempts = job.opts.attempts ?? 3;

      // Only act on final failure (all retries exhausted)
      if (job.attemptsMade < maxAttempts) {
        this.logger.debug('GPU job failed — retries remaining', CTX, {
          source,
          photoId,
          jobId,
          attemptsMade: job.attemptsMade,
          maxAttempts,
        });
        return;
      }

      this.logger.warn('GPU engine failed permanently', CTX, {
        source,
        photoId,
        jobId,
        attemptsMade: job.attemptsMade,
      });

      let photo: { status: string } | null = null;
      try {
        photo = await this.prisma.photo.findUnique({
          where: { id: photoId },
          select: { status: true },
        });
      } catch (err) {
        this.logger.error('Failed to fetch photo status in fallback handler', err instanceof Error ? err : undefined, CTX, {
          photoId,
          source,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const terminalStatuses = ['COMPLETED', 'FAILED', 'FLAGGED'];
      if (!photo || terminalStatuses.includes(photo.status)) {
        this.logger.debug('Fallback skipped — photo already in terminal state', CTX, {
          photoId,
          status: photo?.status ?? 'not found',
        });
        return;
      }

      // Check if other engine produced a result
      let otherResult: { rawText: string | null; source: string } | null = null;
      try {
        otherResult = await this.prisma.ocrResult.findFirst({
          where: { photoId, source: source === 'paddle' ? 'surya' : 'paddle' },
        });
      } catch (err) {
        this.logger.error('Failed to fetch other engine result in fallback handler', err instanceof Error ? err : undefined, CTX, {
          photoId,
          source,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      if (otherResult?.rawText) {
        this.logger.log('Falling back to single-source merge', CTX, {
          failedSource: source,
          usedSource: otherResult.source,
          photoId,
        });

        try {
          // Check if fraud analysis already finished with a non-clean verdict.
          // Using .catch(() => null) so a transient DB error never aborts the fallback merge.
          const existingFraud = await this.prisma.fraudAnalysis
            .findUnique({ where: { photoId }, select: { verdict: true } })
            .catch(() => null);
          const photoStatus =
            existingFraud && existingFraud.verdict !== 'CLEAN' ? 'FLAGGED' : 'COMPLETED';

          await this.prisma.$transaction([
            this.prisma.mergedOcrResult.create({
              data: {
                photoId,
                mergedText: otherResult.rawText,
                confidenceScore: 0.5,
                mergeStrategy: 'single-source',
                selectedSource: otherResult.source,
              },
            }),
            this.prisma.photo.update({
              where: { id: photoId },
              data: { status: photoStatus },
            }),
          ]);

          this.logger.log('Photo completed via single-source fallback', CTX, {
            photoId,
            usedSource: otherResult.source,
            status: photoStatus,
          });

          await this.cleanupFile(photoId);
        } catch (err) {
          // Race condition: other path already completed the merge
          if ((err as { code?: string }).code === 'P2002') {
            this.logger.warn('Single-source fallback skipped — already merged (race condition)', CTX, { photoId });
            return;
          }
          this.logger.error('Single-source fallback transaction failed', err instanceof Error ? err : undefined, CTX, {
            photoId,
            usedSource: otherResult.source,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        this.logger.error('Both GPU engines failed — marking photo as FAILED', undefined, CTX, {
          photoId,
        });

        try {
          await this.prisma.photo.update({
            where: { id: photoId },
            data: { status: 'FAILED' },
          });
        } catch (err) {
          this.logger.error('Failed to mark photo as FAILED after both engines failed', err instanceof Error ? err : undefined, CTX, {
            photoId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        await this.cleanupFile(photoId);
      }
    } catch (err) {
      this.logger.error('Unhandled error in GPU fallback handler', err instanceof Error ? err : undefined, CTX, {
        jobId,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
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
        this.logger.debug('Original file deleted in fallback cleanup', CTX, {
          photoId,
          path: photo.originalPath,
        });
      }
    } catch (err) {
      this.logger.warn('Failed to delete original file in fallback cleanup', CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
