import { Test } from '@nestjs/testing';
import { FraudDetectionService } from './fraud-detection.service';
import { MetadataAnalyzer } from './analyzers/metadata.analyzer';
import { ElaAnalyzer } from './analyzers/ela.analyzer';
import { GeminiFraudAnalyzer } from './analyzers/gemini-fraud.analyzer';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '@fintech/shared-logger';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));
import { readFile } from 'fs/promises';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const IMAGE_BUFFER = Buffer.from('fake-image');

const CLEAN_METADATA = { score: 0, flags: [], software: null, hasExif: false };
const CLEAN_ELA = { score: 0, flags: [], suspiciousBlockCount: 0, totalBlocks: 256, uniformityScore: 1 };
const CLEAN_GEMINI = { score: 0, flags: [], analysis: 'looks fine', confidence: 0, skipped: false };
const TAMPERED_GEMINI = { score: 0.9, flags: ['font mismatch', 'overlay artifact'], analysis: 'tampered', confidence: 0.9, skipped: false };

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;
  let prisma: any;
  let metadataAnalyzer: { analyze: jest.Mock };
  let elaAnalyzer: { analyze: jest.Mock };
  let geminiAnalyzer: { analyze: jest.Mock };

  beforeEach(async () => {
    prisma = {
      fraudAnalysis: { create: jest.fn().mockResolvedValue({}) },
      photo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    metadataAnalyzer = { analyze: jest.fn().mockResolvedValue(CLEAN_METADATA) };
    elaAnalyzer = { analyze: jest.fn().mockResolvedValue(CLEAN_ELA) };
    geminiAnalyzer = { analyze: jest.fn().mockResolvedValue(CLEAN_GEMINI) };

    const module = await Test.createTestingModule({
      providers: [
        FraudDetectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetadataAnalyzer, useValue: metadataAnalyzer },
        { provide: ElaAnalyzer, useValue: elaAnalyzer },
        { provide: GeminiFraudAnalyzer, useValue: geminiAnalyzer },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(FraudDetectionService);
    jest.clearAllMocks();
    (readFile as jest.Mock).mockResolvedValue(IMAGE_BUFFER);
    prisma.fraudAnalysis.create.mockResolvedValue({});
    prisma.photo.updateMany.mockResolvedValue({ count: 1 });
    metadataAnalyzer.analyze.mockResolvedValue(CLEAN_METADATA);
    elaAnalyzer.analyze.mockResolvedValue(CLEAN_ELA);
    geminiAnalyzer.analyze.mockResolvedValue(CLEAN_GEMINI);
  });

  describe('image file access', () => {
    it('returns early when image file is not found', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await service.analyze('photo-1', '/missing.jpg');

      expect(metadataAnalyzer.analyze).not.toHaveBeenCalled();
      expect(prisma.fraudAnalysis.create).not.toHaveBeenCalled();
    });
  });

  describe('verdict: CLEAN', () => {
    it('saves CLEAN verdict when all analyzers return zero score', async () => {
      await service.analyze('photo-1', '/img.jpg');

      expect(prisma.fraudAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ verdict: 'CLEAN' }) }),
      );
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('verdict: LIKELY_FORGED', () => {
    it('saves LIKELY_FORGED and sets photo to FLAGGED when Gemini detects tampering', async () => {
      // ELA flags trigger Gemini
      elaAnalyzer.analyze.mockResolvedValue({
        ...CLEAN_ELA,
        score: 0.5,
        flags: ['ELA: 20/256 blocks suspicious'],
        suspiciousBlockCount: 20,
      });
      geminiAnalyzer.analyze.mockResolvedValue(TAMPERED_GEMINI);

      await service.analyze('photo-1', '/img.jpg');

      expect(prisma.fraudAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ verdict: 'LIKELY_FORGED' }),
        }),
      );
      expect(prisma.photo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FLAGGED' } }),
      );
    });
  });

  describe('early exit optimization', () => {
    it('skips Gemini when no local flags and early score below threshold', async () => {
      // Both analyzers clean — no flags, zero scores
      metadataAnalyzer.analyze.mockResolvedValue(CLEAN_METADATA);
      elaAnalyzer.analyze.mockResolvedValue(CLEAN_ELA);

      await service.analyze('photo-1', '/img.jpg');

      expect(geminiAnalyzer.analyze).not.toHaveBeenCalled();
    });

    it('runs Gemini when ELA has flags even if score is low', async () => {
      elaAnalyzer.analyze.mockResolvedValue({
        ...CLEAN_ELA,
        score: 0.1,
        flags: ['ELA: 10/256 blocks suspicious'],
        suspiciousBlockCount: 10,
      });

      await service.analyze('photo-1', '/img.jpg');

      expect(geminiAnalyzer.analyze).toHaveBeenCalled();
    });

    it('runs Gemini when metadata has flags', async () => {
      metadataAnalyzer.analyze.mockResolvedValue({
        score: 0.8,
        flags: ['Editing software detected: Photoshop'],
        software: 'Adobe Photoshop',
        hasExif: true,
      });

      await service.analyze('photo-1', '/img.jpg');

      expect(geminiAnalyzer.analyze).toHaveBeenCalled();
    });
  });

  describe('analyzer failures', () => {
    it('uses clean fallback when metadata analyzer throws', async () => {
      metadataAnalyzer.analyze.mockRejectedValue(new Error('sharp error'));
      // ELA also clean → Gemini skipped, still saves CLEAN
      await service.analyze('photo-1', '/img.jpg');

      expect(prisma.fraudAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ verdict: 'CLEAN' }) }),
      );
    });

    it('uses clean fallback when ELA analyzer throws', async () => {
      elaAnalyzer.analyze.mockRejectedValue(new Error('out of memory'));

      await service.analyze('photo-1', '/img.jpg');

      expect(prisma.fraudAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ verdict: 'CLEAN' }) }),
      );
    });
  });

  describe('DB persistence', () => {
    it('returns early without updating photo status when fraudAnalysis.create fails', async () => {
      // Need ELA flags to trigger Gemini detection
      elaAnalyzer.analyze.mockResolvedValue({
        ...CLEAN_ELA,
        score: 0.5,
        flags: ['ELA: suspicious'],
        suspiciousBlockCount: 20,
      });
      geminiAnalyzer.analyze.mockResolvedValue(TAMPERED_GEMINI);
      prisma.fraudAnalysis.create.mockRejectedValue(new Error('DB error'));

      await service.analyze('photo-1', '/img.jpg');

      // Should not update photo status if save failed
      expect(prisma.photo.updateMany).not.toHaveBeenCalled();
    });

    it('logs error but does not throw when photo status update fails', async () => {
      elaAnalyzer.analyze.mockResolvedValue({
        ...CLEAN_ELA,
        score: 0.5,
        flags: ['ELA: suspicious'],
        suspiciousBlockCount: 20,
      });
      geminiAnalyzer.analyze.mockResolvedValue(TAMPERED_GEMINI);
      prisma.photo.updateMany.mockRejectedValue(new Error('DB unavailable'));

      await expect(service.analyze('photo-1', '/img.jpg')).resolves.toBeUndefined();
    });
  });

  describe('score calculation', () => {
    it('excludes Gemini weight when Gemini is skipped', async () => {
      // Clean: no flags, no Gemini
      await service.analyze('photo-1', '/img.jpg');

      const call = (prisma.fraudAnalysis.create as jest.Mock).mock.calls[0][0];
      expect(call.data.score).toBe(0);
    });

    it('includes all weights in final score when Gemini runs', async () => {
      elaAnalyzer.analyze.mockResolvedValue({
        ...CLEAN_ELA,
        score: 1.0,
        flags: ['ELA: many blocks'],
        suspiciousBlockCount: 128,
      });
      geminiAnalyzer.analyze.mockResolvedValue(TAMPERED_GEMINI); // score: 0.9

      await service.analyze('photo-1', '/img.jpg');

      const call = (prisma.fraudAnalysis.create as jest.Mock).mock.calls[0][0];
      // score = 0 * 0.10 + 1.0 * 0.15 + 0.9 * 0.75 = 0.15 + 0.675 = 0.825
      expect(call.data.score).toBeCloseTo(0.825);
    });
  });
});
