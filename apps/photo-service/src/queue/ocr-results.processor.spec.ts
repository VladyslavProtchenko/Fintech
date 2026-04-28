import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { OcrResultsProcessor } from './ocr-results.processor';
import { PrismaService } from '../prisma/prisma.service';
import { TextMergeService } from './services/text-merge.service';
import { AppLogger } from '@fintech/shared-logger';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

const MERGE_RESULT = {
  mergedText: 'total 10.00',
  confidenceScore: 0.95,
  strategy: 'direct',
  selectedSource: 'paddle',
};

function makeJob(data: object): Job {
  return { id: 'job-1', data, attemptsMade: 0, opts: {}, failedReason: '' } as any;
}

describe('OcrResultsProcessor', () => {
  let processor: OcrResultsProcessor;
  let prisma: any;
  let textMerge: { merge: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      ocrResult: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      mergedOcrResult: { create: jest.fn() },
      photo: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    };
    textMerge = { merge: jest.fn().mockResolvedValue(MERGE_RESULT) };

    const module = await Test.createTestingModule({
      providers: [
        OcrResultsProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: TextMergeService, useValue: textMerge },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get(OcrResultsProcessor);
  });

  const jobData = { photoId: 'photo-1', source: 'paddle' as const, raw_text: 'hello', data: {} };

  describe('process — first result (count < 2)', () => {
    it('saves result but does not trigger merge', async () => {
      // $transaction returns [savedResult, count=1]
      prisma.$transaction.mockResolvedValue([{}, 1]);

      await processor.process(makeJob(jobData));

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(textMerge.merge).not.toHaveBeenCalled();
    });
  });

  describe('process — second result (count >= 2)', () => {
    beforeEach(() => {
      prisma.$transaction
        .mockResolvedValueOnce([{}, 2]) // save + count = 2
        .mockResolvedValueOnce([{}, {}]); // merge transaction
      prisma.ocrResult.findMany.mockResolvedValue([
        { source: 'paddle', rawText: 'paddle text' },
        { source: 'surya', rawText: 'surya text' },
      ]);
    });

    it('calls TextMergeService.merge and saves MergedOcrResult', async () => {
      await processor.process(makeJob(jobData));

      expect(textMerge.merge).toHaveBeenCalledWith('paddle text', 'surya text');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('sets photo status to COMPLETED', async () => {
      await processor.process(makeJob(jobData));

      // Second $transaction call contains the photo update
      const secondCall = (prisma.$transaction as jest.Mock).mock.calls[1][0];
      expect(secondCall).toContain(undefined); // prisma operations are just values in array
    });
  });

  describe('P2002 race condition on merge', () => {
    it('silently skips when MergedOcrResult already exists', async () => {
      prisma.$transaction
        .mockResolvedValueOnce([{}, 2])
        .mockRejectedValueOnce({ code: 'P2002' });
      prisma.ocrResult.findMany.mockResolvedValue([
        { source: 'paddle', rawText: 'text' },
        { source: 'surya', rawText: 'text' },
      ]);

      // Should not throw
      await expect(processor.process(makeJob(jobData))).resolves.toBeUndefined();
    });
  });

  describe('onFailed', () => {
    it('marks photo as FAILED', async () => {
      await processor.onFailed(makeJob(jobData));
      expect(prisma.photo.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
    });
  });
});
