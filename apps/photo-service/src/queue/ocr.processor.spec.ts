import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OcrProcessor } from './ocr.processor';
import { PrismaService } from '../prisma/prisma.service';
import { ImageProcessorService } from '../upload/services/image-processor.service';
import { AppLogger } from '@fintech/shared-logger';
import { FRAUD_QUEUE } from '../fraud/constants';

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('image data')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
}));

import { readFile, writeFile, copyFile } from 'fs/promises';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeJob(data: object): Job {
  return {
    id: 'job-1',
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
    failedReason: '',
  } as any;
}

describe('OcrProcessor', () => {
  let processor: OcrProcessor;
  let prisma: any;
  let imageProcessor: { preprocess: jest.Mock };
  let paddleQueue: { add: jest.Mock };
  let suryaQueue: { add: jest.Mock };
  let fraudQueue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = { photo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    imageProcessor = { preprocess: jest.fn().mockResolvedValue(Buffer.from('processed')) };
    paddleQueue = { add: jest.fn().mockResolvedValue({ id: 'p-job' }) };
    suryaQueue = { add: jest.fn().mockResolvedValue({ id: 's-job' }) };
    fraudQueue = { add: jest.fn().mockResolvedValue({ id: 'f-job' }) };

    const module = await Test.createTestingModule({
      providers: [
        OcrProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: ImageProcessorService, useValue: imageProcessor },
        { provide: AppLogger, useValue: mockLogger },
        { provide: getQueueToken('ocr-paddle'), useValue: paddleQueue },
        { provide: getQueueToken('ocr-surya'), useValue: suryaQueue },
        { provide: getQueueToken(FRAUD_QUEUE), useValue: fraudQueue },
      ],
    }).compile();

    processor = module.get(OcrProcessor);
    jest.clearAllMocks();
    (readFile as jest.Mock).mockResolvedValue(Buffer.from('image data'));
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    prisma.photo.updateMany.mockResolvedValue({ count: 1 });
    imageProcessor.preprocess.mockResolvedValue(Buffer.from('processed'));
    paddleQueue.add.mockResolvedValue({ id: 'p-job' });
    suryaQueue.add.mockResolvedValue({ id: 's-job' });
    fraudQueue.add.mockResolvedValue({ id: 'f-job' });
    (copyFile as jest.Mock).mockResolvedValue(undefined);
  });

  describe('process', () => {
    const jobData = { photoId: 'photo-1', originalPath: '/uploads/photo-1.jpg', mimeType: 'image/jpeg' };

    it('sets photo status to PROCESSING', async () => {
      await processor.process(makeJob(jobData));
      expect(prisma.photo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PROCESSING' } }),
      );
    });

    it('preprocesses image and dispatches to both GPU queues and fraud queue', async () => {
      await processor.process(makeJob(jobData));

      expect(imageProcessor.preprocess).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
      expect(paddleQueue.add).toHaveBeenCalledWith('ocr-paddle', expect.objectContaining({ photoId: 'photo-1' }));
      expect(suryaQueue.add).toHaveBeenCalledWith('ocr-surya', expect.objectContaining({ photoId: 'photo-1' }));
      expect(fraudQueue.add).toHaveBeenCalledWith(
        FRAUD_QUEUE,
        expect.objectContaining({ photoId: 'photo-1', imagePath: expect.stringContaining('.fraud') }),
      );
    });

    it('copies image to .fraud path before dispatching fraud job', async () => {
      await processor.process(makeJob(jobData));

      expect(copyFile).toHaveBeenCalledWith(jobData.originalPath, `${jobData.originalPath}.fraud`);
    });

    it('overwrites original file with preprocessed result', async () => {
      const processed = Buffer.from('preprocessed image');
      imageProcessor.preprocess.mockResolvedValue(processed);

      await processor.process(makeJob(jobData));

      expect(writeFile).toHaveBeenCalledWith(jobData.originalPath, processed);
    });

    it('marks photo as FAILED and rethrows on preprocessing error', async () => {
      imageProcessor.preprocess.mockRejectedValue(new Error('sharp failed'));

      await expect(processor.process(makeJob(jobData))).rejects.toThrow('sharp failed');
      expect(prisma.photo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
      expect(paddleQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('marks photo as FAILED', async () => {
      const job = makeJob({ photoId: 'photo-1', originalPath: '/path', mimeType: 'image/jpeg' });
      await processor.onFailed(job);
      expect(prisma.photo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
    });
  });
});
