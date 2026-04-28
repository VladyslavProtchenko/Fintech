import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { GpuFallbackService } from './gpu-fallback.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '@fintech/shared-logger';

jest.mock('bullmq', () => ({
  Queue: jest.fn(),
  QueueEvents: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('GpuFallbackService', () => {
  let service: GpuFallbackService;
  let prisma: any;
  let mockPaddleQueue: any;
  let mockSuryaQueue: any;

  beforeEach(async () => {
    prisma = {
      photo: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      ocrResult: { findFirst: jest.fn() },
      mergedOcrResult: { create: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([{}, {}]),
    };

    mockPaddleQueue = { getJob: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    mockSuryaQueue = { getJob: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    const mockPaddleEvents = { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    const mockSuryaEvents = { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };

    (Queue as unknown as jest.Mock)
      .mockImplementationOnce(() => mockPaddleQueue)
      .mockImplementationOnce(() => mockSuryaQueue);
    (QueueEvents as unknown as jest.Mock)
      .mockImplementationOnce(() => mockPaddleEvents)
      .mockImplementationOnce(() => mockSuryaEvents);

    const module = await Test.createTestingModule({
      providers: [
        GpuFallbackService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('localhost') } },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(GpuFallbackService);
    service.onModuleInit();
  });

  function makeJob(photoId: string, attemptsMade: number, maxAttempts = 3) {
    return {
      data: { photoId },
      opts: { attempts: maxAttempts },
      attemptsMade,
    };
  }

  describe('onGpuJobFailed', () => {
    it('does nothing when job not found in queue', async () => {
      mockPaddleQueue.getJob.mockResolvedValue(null);
      await (service as any).onGpuJobFailed('job-1', 'paddle');
      expect(prisma.photo.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing when retries are not exhausted', async () => {
      mockPaddleQueue.getJob.mockResolvedValue(makeJob('photo-1', 1, 3));
      await (service as any).onGpuJobFailed('job-1', 'paddle');
      expect(prisma.photo.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing when photo is already in terminal state', async () => {
      mockPaddleQueue.getJob.mockResolvedValue(makeJob('photo-1', 3, 3));
      prisma.photo.findUnique.mockResolvedValue({ status: 'COMPLETED' });

      await (service as any).onGpuJobFailed('job-1', 'paddle');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('performs single-source merge when other engine result exists', async () => {
      mockPaddleQueue.getJob.mockResolvedValue(makeJob('photo-1', 3, 3));
      prisma.photo.findUnique
        .mockResolvedValueOnce({ status: 'PROCESSING' }) // status check
        .mockResolvedValueOnce({ originalPath: '/uploads/photo-1.jpg' }); // cleanup
      prisma.ocrResult.findFirst.mockResolvedValue({ rawText: 'surya result', source: 'surya' });

      await (service as any).onGpuJobFailed('job-1', 'paddle');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('marks photo as FAILED when both engines failed', async () => {
      mockPaddleQueue.getJob.mockResolvedValue(makeJob('photo-1', 3, 3));
      prisma.photo.findUnique
        .mockResolvedValueOnce({ status: 'PROCESSING' })
        .mockResolvedValueOnce({ originalPath: '/uploads/photo-1.jpg' });
      prisma.ocrResult.findFirst.mockResolvedValue(null);

      await (service as any).onGpuJobFailed('job-1', 'paddle');

      expect(prisma.photo.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
    });

    it('silently handles P2002 race condition on single-source merge', async () => {
      mockPaddleQueue.getJob.mockResolvedValue(makeJob('photo-1', 3, 3));
      prisma.photo.findUnique.mockResolvedValue({ status: 'PROCESSING' });
      prisma.ocrResult.findFirst.mockResolvedValue({ rawText: 'text', source: 'surya' });
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

      await expect((service as any).onGpuJobFailed('job-1', 'paddle')).resolves.toBeUndefined();
    });
  });
});
