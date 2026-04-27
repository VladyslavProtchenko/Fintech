import { readFile, writeFile } from 'fs/promises';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ImageProcessorService } from '../upload/services/image-processor.service';
import { AllowedMimeType } from '../upload/constants';

interface OcrJobData {
  photoId: string;
  originalPath: string;
  mimeType: AllowedMimeType;
}

@Processor('ocr')
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageProcessor: ImageProcessorService,
    @InjectQueue('ocr-paddle') private readonly paddleQueue: Queue,
    @InjectQueue('ocr-surya') private readonly suryaQueue: Queue,
  ) {
    super();
  }

  async onFailed(job: Job<OcrJobData>): Promise<void> {
    const { photoId } = job.data;
    this.logger.error(`Photo ${photoId} failed after all retries`);
    await this.prisma.photo.update({
      where: { id: photoId },
      data: { status: 'FAILED' },
    });
  }

  async process(job: Job<OcrJobData>): Promise<void> {
    const { photoId, originalPath, mimeType } = job.data;

    await this.prisma.photo.update({
      where: { id: photoId },
      data: { status: 'PROCESSING' },
    });

    try {
      const buffer = await readFile(originalPath);
      const processed = await this.imageProcessor.preprocess(buffer, mimeType);

      // Overwrite original with preprocessed version (autoOrient + HEIC→JPEG)
      await writeFile(originalPath, processed);

      await Promise.all([
        this.paddleQueue.add('ocr-paddle', { photoId, imagePath: originalPath }),
        this.suryaQueue.add('ocr-surya', { photoId, imagePath: originalPath }),
      ]);

      this.logger.log(`Photo ${photoId} preprocessed, dispatched to paddle + surya`);
    } catch (error) {
      this.logger.error(`Photo ${photoId} preprocessing failed`, error);

      await this.prisma.photo.update({
        where: { id: photoId },
        data: { status: 'FAILED' },
      });

      throw error;
    }
  }
}
