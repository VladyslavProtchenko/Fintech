import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GpuFallbackService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpuFallbackService.name);
  private paddleEvents!: QueueEvents;
  private suryaEvents!: QueueEvents;
  private paddleQueue!: Queue;
  private suryaQueue!: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = {
      host: this.config.get<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT'),
    };

    this.paddleQueue = new Queue('ocr-paddle', { connection });
    this.suryaQueue = new Queue('ocr-surya', { connection });
    this.paddleEvents = new QueueEvents('ocr-paddle', { connection });
    this.suryaEvents = new QueueEvents('ocr-surya', { connection });

    this.paddleEvents.on('failed', ({ jobId }) => this.onGpuJobFailed(jobId, 'paddle'));
    this.suryaEvents.on('failed', ({ jobId }) => this.onGpuJobFailed(jobId, 'surya'));

    this.logger.log('GPU fallback listeners started');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.paddleEvents.close(),
      this.suryaEvents.close(),
      this.paddleQueue.close(),
      this.suryaQueue.close(),
    ]);
  }

  private async onGpuJobFailed(jobId: string, source: 'paddle' | 'surya'): Promise<void> {
    const queue = source === 'paddle' ? this.paddleQueue : this.suryaQueue;
    const job = await queue.getJob(jobId);

    if (!job) return;

    const { photoId } = job.data as { photoId: string };
    const maxAttempts = job.opts.attempts ?? 3;

    // Only act on final failure (all retries exhausted)
    if (job.attemptsMade < maxAttempts) return;

    this.logger.warn(`Engine ${source} failed permanently for photo ${photoId}`);

    // Check if photo is already completed (other engine + merge finished)
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      select: { status: true },
    });

    if (!photo || photo.status === 'COMPLETED' || photo.status === 'FAILED') return;

    // Check if other engine produced a result
    const otherResult = await this.prisma.ocrResult.findFirst({
      where: { photoId, source: source === 'paddle' ? 'surya' : 'paddle' },
    });

    if (otherResult?.rawText) {
      this.logger.log(`Fallback to single-source (${otherResult.source}) for photo ${photoId}`);

      try {
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
            data: { status: 'COMPLETED' },
          }),
        ]);

        this.logger.log(`Photo ${photoId} COMPLETED (single-source: ${otherResult.source})`);
        await this.cleanupFile(photoId);
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') return;
        this.logger.error(`Fallback failed for photo ${photoId}`, error);
      }
    } else {
      this.logger.error(`Both engines failed for photo ${photoId} — marking FAILED`);
      await this.prisma.photo.update({
        where: { id: photoId },
        data: { status: 'FAILED' },
      });
      await this.cleanupFile(photoId);
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
      }
    } catch {
      // ignore cleanup errors
    }
  }
}
