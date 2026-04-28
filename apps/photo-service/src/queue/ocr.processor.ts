import { readFile, writeFile } from 'fs/promises';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { AppLogger } from '@fintech/shared-logger';
import { PrismaService } from '../prisma/prisma.service';
import { ImageProcessorService } from '../upload/services/image-processor.service';
import { AllowedMimeType } from '../upload/constants';

const CTX = 'OcrProcessor';

interface OcrJobData {
  photoId: string;
  originalPath: string;
  mimeType: AllowedMimeType;
}

@Processor('ocr')
export class OcrProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly logger: AppLogger,
    @InjectQueue('ocr-paddle') private readonly paddleQueue: Queue,
    @InjectQueue('ocr-surya') private readonly suryaQueue: Queue,
  ) {
    super();
  }

  async onFailed(job: Job<OcrJobData>): Promise<void> {
    const { photoId } = job.data;

    this.logger.error('OCR job failed after all retries', undefined, CTX, {
      photoId,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
    });

    await this.prisma.photo.updateMany({
      where: { id: photoId },
      data: { status: 'FAILED' },
    }).catch((err: unknown) => {
      this.logger.warn('Failed to mark photo as FAILED in onFailed hook', CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async process(job: Job<OcrJobData>): Promise<void> {
    const { photoId, originalPath, mimeType } = job.data;
    const start = Date.now();

    this.logger.log('OCR job started', CTX, {
      photoId,
      jobId: job.id,
      mimeType,
      attempt: job.attemptsMade + 1,
    });

    // updateMany avoids throwing when photo was deleted concurrently
    await this.prisma.photo.updateMany({
      where: { id: photoId },
      data: { status: 'PROCESSING' },
    }).catch((err: unknown) => {
      this.logger.warn('Failed to set photo status to PROCESSING', CTX, {
        photoId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    try {
      const buffer = await readFile(originalPath);
      const processed = await this.imageProcessor.preprocess(buffer, mimeType);

      // Overwrite original with preprocessed version (autoOrient + HEIC→JPEG)
      await writeFile(originalPath, processed);

      await Promise.all([
        this.paddleQueue.add('ocr-paddle', {
          photoId,
          imagePath: originalPath,
        }),
        this.suryaQueue.add('ocr-surya', { photoId, imagePath: originalPath }),
      ]);

      this.logger.log('Photo preprocessed and dispatched to GPU workers', CTX, {
        photoId,
        mimeType,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      this.logger.error('Photo preprocessing failed', err instanceof Error ? err : undefined, CTX, {
        photoId,
        originalPath,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });

      await this.prisma.photo.updateMany({
        where: { id: photoId },
        data: { status: 'FAILED' },
      }).catch((updateErr: unknown) => {
        this.logger.warn('Failed to mark photo as FAILED after preprocessing error', CTX, {
          photoId,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      });

      throw err;
    }
  }
}
