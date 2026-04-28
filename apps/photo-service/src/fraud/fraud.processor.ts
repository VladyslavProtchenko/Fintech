import { unlink } from 'fs/promises';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AppLogger } from '@fintech/shared-logger';
import { FraudDetectionService } from './fraud-detection.service';
import { FRAUD_QUEUE } from './constants';

const CTX = 'FraudProcessor';

interface FraudJobData {
  photoId: string;
  imagePath: string; // separate copy created in OcrProcessor, deleted here after analysis
}

@Processor(FRAUD_QUEUE)
export class FraudProcessor extends WorkerHost {
  constructor(
    private readonly fraudDetection: FraudDetectionService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async onFailed(job: Job<FraudJobData>): Promise<void> {
    this.logger.error('Fraud job failed after all retries', undefined, CTX, {
      photoId: job.data.photoId,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
    });
  }

  async process(job: Job<FraudJobData>): Promise<void> {
    const { photoId, imagePath } = job.data;

    this.logger.log('Fraud job started', CTX, {
      photoId,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    try {
      await this.fraudDetection.analyze(photoId, imagePath);
    } finally {
      // Always delete the fraud image copy regardless of outcome
      await unlink(imagePath).catch((err: unknown) => {
        this.logger.warn('Failed to delete fraud image copy', CTX, {
          photoId,
          imagePath,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }
}
