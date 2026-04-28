import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UploadController } from './upload.controller';
import { PrismaService } from '../prisma/prisma.service';
import { FileValidatorService } from './services/file-validator.service';
import { DedupService } from './services/dedup.service';
import { AppLogger } from '@fintech/shared-logger';

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { writeFile, unlink } from 'fs/promises';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeFile(size = 100): Express.Multer.File {
  return {
    buffer: Buffer.alloc(size, 0xff),
    originalname: 'receipt.jpg',
    mimetype: 'image/jpeg',
    size,
    fieldname: 'file',
    encoding: '7bit',
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('UploadController', () => {
  let controller: UploadController;
  let prisma: any;
  let fileValidator: { detectMimeType: jest.Mock };
  let dedup: { hash: jest.Mock; findDuplicate: jest.Mock };
  let ocrQueue: { add: jest.Mock };
  let res: { status: jest.Mock };

  beforeEach(async () => {
    prisma = {
      photo: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    fileValidator = { detectMimeType: jest.fn().mockReturnValue('image/jpeg') };
    dedup = {
      hash: jest.fn().mockReturnValue('sha256hash'),
      findDuplicate: jest.fn().mockResolvedValue(null),
    };
    ocrQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    res = { status: jest.fn().mockReturnThis() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: FileValidatorService, useValue: fileValidator },
        { provide: DedupService, useValue: dedup },
        { provide: AppLogger, useValue: mockLogger },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
        { provide: getQueueToken('ocr'), useValue: ocrQueue },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UploadController);
    jest.clearAllMocks();
    fileValidator.detectMimeType.mockReturnValue('image/jpeg');
    dedup.hash.mockReturnValue('sha256hash');
    dedup.findDuplicate.mockResolvedValue(null);
    prisma.photo.create.mockResolvedValue({});
    prisma.photo.update.mockResolvedValue({});
    prisma.photo.delete.mockResolvedValue({});
    ocrQueue.add.mockResolvedValue({ id: 'job-1' });
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (unlink as jest.Mock).mockResolvedValue(undefined);
    res.status.mockReturnThis();
  });

  it('throws when no file is provided', async () => {
    await expect(controller.upload(undefined as any, res as any)).rejects.toThrow();
  });

  it('throws when file format is unsupported', async () => {
    fileValidator.detectMimeType.mockReturnValue(null);
    await expect(controller.upload(makeFile(), res as any)).rejects.toThrow();
  });

  it('returns DUPLICATE with HTTP 200 when hash already exists', async () => {
    dedup.findDuplicate.mockResolvedValue({ id: 'existing-id', sha256: 'sha256hash' });

    const result = await controller.upload(makeFile(), res as any);

    expect(result.status).toBe('DUPLICATE');
    expect(result.existingId).toBe('existing-id');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(prisma.photo.create).not.toHaveBeenCalled();
  });

  it('returns PENDING with jobId on successful upload', async () => {
    const result = await controller.upload(makeFile(), res as any);

    expect(result.status).toBe('PENDING');
    expect(result.jobId).toBe('job-1');
    expect(result.sha256).toBe('sha256hash');
    expect(ocrQueue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({ mimeType: 'image/jpeg' }),
      expect.any(Object),
    );
    expect(writeFile).toHaveBeenCalled();
  });

  it('handles P2002 race condition — returns DUPLICATE with HTTP 200', async () => {
    prisma.photo.create.mockRejectedValue({ code: 'P2002' });
    dedup.findDuplicate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'race-id', sha256: 'sha256hash' });

    const result = await controller.upload(makeFile(), res as any);

    expect(result.status).toBe('DUPLICATE');
    expect(result.existingId).toBe('race-id');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('rolls back DB record when file write fails', async () => {
    (writeFile as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    await expect(controller.upload(makeFile(), res as any)).rejects.toThrow();
    expect(prisma.photo.delete).toHaveBeenCalled();
  });

  it('rolls back DB record and file when queue enqueue fails', async () => {
    ocrQueue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(controller.upload(makeFile(), res as any)).rejects.toThrow();
    expect(unlink).toHaveBeenCalled();
    expect(prisma.photo.delete).toHaveBeenCalled();
  });
});
