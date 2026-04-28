import { Test } from '@nestjs/testing';
import { ResultsController } from './results.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '@fintech/shared-logger';
import { GetResultsDto } from './dto/get-results.dto';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

const MOCK_ITEM = {
  id: 'result-1',
  mergedText: 'total 10.00',
  confidenceScore: 0.95,
  mergeStrategy: 'direct',
  selectedSource: 'paddle',
  createdAt: new Date(),
  photo: { id: 'photo-1', originalName: 'receipt.jpg', status: 'COMPLETED' },
};

describe('ResultsController', () => {
  let controller: ResultsController;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      mergedOcrResult: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
      photo: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      controllers: [ResultsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    controller = module.get(ResultsController);
  });

  describe('findAll', () => {
    it('returns paginated results with total', async () => {
      prisma.$transaction.mockResolvedValue([[MOCK_ITEM], 1]);
      const query: GetResultsDto = { limit: 10, offset: 0 };

      const result = await controller.findAll(query);

      expect(result).toEqual({ items: [MOCK_ITEM], total: 1, limit: 10, offset: 0 });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('uses provided limit and offset', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);
      const query: GetResultsDto = { limit: 5, offset: 20 };

      const result = await controller.findAll(query);

      expect(result.limit).toBe(5);
      expect(result.offset).toBe(20);
    });

    it('throws AppException on prisma error', async () => {
      prisma.$transaction.mockRejectedValue(new Error('db down'));

      await expect(controller.findAll({ limit: 10, offset: 0 })).rejects.toThrow();
    });
  });

  describe('getStatus', () => {
    it('returns photo with merged result when found', async () => {
      const photo = { id: 'photo-1', originalName: 'r.jpg', status: 'COMPLETED', mergedResult: MOCK_ITEM };
      prisma.photo.findUnique.mockResolvedValue(photo);

      const result = await controller.getStatus('photo-1');

      expect(result).toBe(photo);
    });

    it('throws 404 when photo not found', async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      await expect(controller.getStatus('missing-id')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('findOne', () => {
    it('returns merged result when found', async () => {
      prisma.mergedOcrResult.findUnique.mockResolvedValue(MOCK_ITEM);

      const result = await controller.findOne('result-1');

      expect(result).toBe(MOCK_ITEM);
    });

    it('throws 404 when result not found', async () => {
      prisma.mergedOcrResult.findUnique.mockResolvedValue(null);

      await expect(controller.findOne('missing-id')).rejects.toMatchObject({ status: 404 });
    });
  });
});
