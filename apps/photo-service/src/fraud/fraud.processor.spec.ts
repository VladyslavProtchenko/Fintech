import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { FraudProcessor } from './fraud.processor';
import { FraudDetectionService } from './fraud-detection.service';
import { AppLogger } from '@fintech/shared-logger';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));
import { unlink } from 'fs/promises';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeJob(data: object): Job {
  return { id: 'fraud-job-1', data, attemptsMade: 0, opts: {}, failedReason: '' } as any;
}

describe('FraudProcessor', () => {
  let processor: FraudProcessor;
  let fraudDetection: { analyze: jest.Mock };

  beforeEach(async () => {
    fraudDetection = { analyze: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        FraudProcessor,
        { provide: FraudDetectionService, useValue: fraudDetection },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get(FraudProcessor);
    jest.clearAllMocks();
    (unlink as jest.Mock).mockResolvedValue(undefined);
    fraudDetection.analyze.mockResolvedValue(undefined);
  });

  const jobData = { photoId: 'photo-1', imagePath: '/uploads/photo-1.jpg.fraud' };

  describe('process', () => {
    it('calls FraudDetectionService.analyze with photoId and imagePath', async () => {
      await processor.process(makeJob(jobData));

      expect(fraudDetection.analyze).toHaveBeenCalledWith('photo-1', '/uploads/photo-1.jpg.fraud');
    });

    it('always deletes fraud image copy after analysis', async () => {
      await processor.process(makeJob(jobData));

      expect(unlink).toHaveBeenCalledWith('/uploads/photo-1.jpg.fraud');
    });

    it('deletes fraud image copy even when analyze throws', async () => {
      fraudDetection.analyze.mockRejectedValue(new Error('unexpected failure'));

      // FraudDetectionService.analyze should never throw, but we verify the finally block works
      await expect(processor.process(makeJob(jobData))).rejects.toThrow('unexpected failure');
      expect(unlink).toHaveBeenCalledWith('/uploads/photo-1.jpg.fraud');
    });

    it('does not throw when unlink fails', async () => {
      (unlink as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(processor.process(makeJob(jobData))).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('logs error with job details', async () => {
      const job = { ...makeJob(jobData), failedReason: 'timed out' } as any;
      await processor.onFailed(job);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
