import { Test } from '@nestjs/testing';
import { DedupService } from './dedup.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('DedupService', () => {
  let service: DedupService;
  let prisma: { photo: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { photo: { findUnique: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [
        DedupService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DedupService);
  });

  describe('hash', () => {
    it('returns a 64-char lowercase hex string', () => {
      const h = service.hash(Buffer.from('hello world'));
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic for the same input', () => {
      const buf = Buffer.from('deterministic');
      expect(service.hash(buf)).toBe(service.hash(buf));
    });

    it('produces different hashes for different inputs', () => {
      expect(service.hash(Buffer.from('a'))).not.toBe(service.hash(Buffer.from('b')));
    });
  });

  describe('findDuplicate', () => {
    it('returns the photo when found', async () => {
      const photo = { id: 'photo-1', sha256: 'deadbeef' } as any;
      prisma.photo.findUnique.mockResolvedValue(photo);

      const result = await service.findDuplicate('deadbeef');

      expect(result).toBe(photo);
      expect(prisma.photo.findUnique).toHaveBeenCalledWith({ where: { sha256: 'deadbeef' } });
    });

    it('returns null when not found', async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      await expect(service.findDuplicate('unknown-hash')).resolves.toBeNull();
    });
  });
});
