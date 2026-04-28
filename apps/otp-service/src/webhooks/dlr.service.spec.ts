import { Test } from '@nestjs/testing';
import { DlrService, NormalizedDlr } from './dlr.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '@fintech/shared-logger';
import { OtpStatus } from '../../generated/prisma/client';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('DlrService', () => {
  let service: DlrService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      dlrCallback: { create: jest.fn().mockResolvedValue({}) },
      otpAuditLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    const module = await Test.createTestingModule({
      providers: [
        DlrService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(DlrService);
  });

  describe('normalizeTwilio', () => {
    it('maps delivered status', () => {
      const result = service.normalizeTwilio({ MessageSid: 'SM123', MessageStatus: 'delivered' });
      expect(result?.status).toBe('delivered');
      expect(result?.providerRef).toBe('SM123');
      expect(result?.provider).toBe('twilio');
    });

    it('maps failed status', () => {
      const result = service.normalizeTwilio({ MessageSid: 'SM123', MessageStatus: 'failed' });
      expect(result?.status).toBe('failed');
    });

    it('returns null when MessageSid is missing', () => {
      const result = service.normalizeTwilio({ MessageStatus: 'delivered' });
      expect(result).toBeNull();
    });

    it('returns unknown for unrecognized status', () => {
      const result = service.normalizeTwilio({ MessageSid: 'SM123', MessageStatus: 'queued' });
      expect(result?.status).toBe('unknown');
    });
  });

  describe('normalizeMsg91', () => {
    it('maps delivered status (code 1)', () => {
      const result = service.normalizeMsg91({ requestId: 'req-1', status: '1' });
      expect(result?.status).toBe('delivered');
      expect(result?.providerRef).toBe('req-1');
    });

    it('maps failed status (code 2)', () => {
      const result = service.normalizeMsg91({ requestId: 'req-1', status: '2' });
      expect(result?.status).toBe('failed');
    });

    it('returns null when requestId is missing', () => {
      const result = service.normalizeMsg91({ status: '1' });
      expect(result).toBeNull();
    });
  });

  describe('process', () => {
    const dlr: NormalizedDlr = {
      provider: 'twilio',
      providerRef: 'SM123',
      status: 'delivered',
      rawPayload: {},
    };

    it('persists DLR callback', async () => {
      await service.process(dlr);
      expect(prisma.dlrCallback.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ providerRef: 'SM123' }) }),
      );
    });

    it('updates audit log to DELIVERED on delivered status', async () => {
      await service.process(dlr);
      expect(prisma.otpAuditLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OtpStatus.DELIVERED } }),
      );
    });

    it('updates audit log to FAILED on failed status', async () => {
      await service.process({ ...dlr, status: 'failed' });
      expect(prisma.otpAuditLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OtpStatus.FAILED } }),
      );
    });

    it('skips audit update for unknown status', async () => {
      await service.process({ ...dlr, status: 'unknown' });
      expect(prisma.otpAuditLog.updateMany).not.toHaveBeenCalled();
    });

    it('throws when dlrCallback.create fails (so provider retries)', async () => {
      prisma.dlrCallback.create.mockRejectedValue(new Error('db error'));
      await expect(service.process(dlr)).rejects.toThrow('db error');
    });
  });
});
