import { Test } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { PhoneService, PhoneInfo } from '../phone/phone.service';
import { ChannelOrchestratorService } from '../channels/channel-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '@fintech/shared-logger';
import { REDIS_CLIENT } from '@fintech/shared-redis';
import { ConfigService } from '@nestjs/config';
import { OtpStatus } from '../../generated/prisma/client';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

const MOCK_PHONE: PhoneInfo = {
  e164: '+12025551234',
  masked: '+1202****1234',
  hash: 'a'.repeat(64),
  country: 'US',
  nationalNumber: '2025551234',
};

const CONFIG_VALUES: Record<string, number> = {
  OTP_LENGTH: 6,
  OTP_TTL_SECONDS: 300,
  OTP_MAX_ATTEMPTS: 3,
  OTP_RATE_LIMIT_PER_10MIN: 5,
  OTP_RATE_LIMIT_PER_HOUR: 10,
  OTP_COOLDOWN_SECONDS: 30,
  OTP_IP_RATE_LIMIT_PER_10MIN: 20,
};

describe('OtpService', () => {
  let service: OtpService;
  let redis: any;
  let phoneService: { parse: jest.Mock };
  let orchestrator: { send: jest.Mock };
  let prisma: any;
  let pipeline: any;

  beforeEach(async () => {
    pipeline = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      ttl: jest.fn().mockResolvedValue(25),
      pipeline: jest.fn().mockReturnValue(pipeline),
    };
    phoneService = { parse: jest.fn().mockReturnValue(MOCK_PHONE) };
    orchestrator = {
      send: jest.fn().mockResolvedValue({
        success: true,
        channel: 'SMS',
        provider: 'twilio',
        providerRef: 'ref-1',
        latencyMs: 100,
        failoverChain: [],
      }),
    };
    prisma = {
      otpAuditLog: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((k: string, d?: unknown) => CONFIG_VALUES[k] ?? d) } },
        { provide: PhoneService, useValue: phoneService },
        { provide: ChannelOrchestratorService, useValue: orchestrator },
        { provide: PrismaService, useValue: prisma },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(OtpService);
  });

  // ─── send ─────────────────────────────────────────────────────────────────

  describe('send', () => {
    it('returns OTP result with masked phone on success', async () => {
      const result = await service.send('+12025551234', '1.2.3.4');

      expect(result.maskedPhone).toBe(MOCK_PHONE.masked);
      expect(result.channel).toBe('SMS');
      expect(result.provider).toBe('twilio');
      expect(result.expiresIn).toBe(300);
      expect(redis.set).toHaveBeenCalled(); // OTP stored
    });

    it('persists audit log as SENT', async () => {
      await service.send('+12025551234');
      expect(prisma.otpAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: OtpStatus.SENT }) }),
      );
    });

    it('throws when cooldown is active', async () => {
      redis.exists.mockResolvedValue(1);
      redis.ttl.mockResolvedValue(20);
      await expect(service.send('+12025551234')).rejects.toThrow();
    });

    it('throws when 10-min rate limit is reached', async () => {
      redis.exists.mockResolvedValue(0);
      redis.get.mockImplementation((key: string) =>
        key.startsWith('rl:10m') ? Promise.resolve('5') : Promise.resolve('0'),
      );
      await expect(service.send('+12025551234')).rejects.toThrow();
    });

    it('throws when hourly rate limit is reached', async () => {
      redis.exists.mockResolvedValue(0);
      redis.get.mockImplementation((key: string) =>
        key.startsWith('rl:1h') ? Promise.resolve('10') : Promise.resolve('0'),
      );
      await expect(service.send('+12025551234')).rejects.toThrow();
    });

    it('removes cooldown and throws when provider delivery fails', async () => {
      orchestrator.send.mockResolvedValue({ success: false, failoverChain: [] });

      await expect(service.send('+12025551234')).rejects.toThrow();
      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining('cooldown'));
    });

    it('does not store OTP in Redis when delivery fails', async () => {
      orchestrator.send.mockResolvedValue({ success: false, failoverChain: [] });
      // set is called only for cooldown initially, then del is called — OTP store should not happen
      // Capture set calls after the failure path
      await expect(service.send('+12025551234')).rejects.toThrow();
      // The OTP set call (with 'EX' TTL) should not have happened since delivery failed
      const otpSetCalls = redis.set.mock.calls.filter(
        (c: unknown[]) => c[0] === `otp:${MOCK_PHONE.hash}`,
      );
      expect(otpSetCalls).toHaveLength(0);
    });
  });

  // ─── verify ───────────────────────────────────────────────────────────────

  describe('verify', () => {
    function storedOtp(code: string, attempts = 0): void {
      redis.get.mockResolvedValue(
        JSON.stringify({ code, requestId: 'req-1', attempts, createdAt: Date.now() }),
      );
    }

    it('returns success=false and updates audit to TIMEOUT when OTP not found (expired)', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.verify('+12025551234', '123456');

      expect(result.success).toBe(false);
      expect(result.attemptsLeft).toBe(0);
      expect(prisma.otpAuditLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OtpStatus.TIMEOUT, attempts: 0 } }),
      );
    });

    it('deletes key and returns failure when Redis data is corrupted JSON', async () => {
      redis.get.mockResolvedValue('not valid json {{{');

      const result = await service.verify('+12025551234', '123456');

      expect(result.success).toBe(false);
      expect(redis.del).toHaveBeenCalled();
    });

    it('returns failure with attemptsLeft on wrong code', async () => {
      storedOtp('654321', 0);

      const result = await service.verify('+12025551234', '000000');

      expect(result.success).toBe(false);
      expect(result.attemptsLeft).toBe(2); // maxAttempts=3, attempts=1 left=2
    });

    it('marks as FAILED and deletes key when attempts are exhausted', async () => {
      storedOtp('654321', 2); // 2 previous failures, 3rd attempt about to be made

      const result = await service.verify('+12025551234', '000000');

      expect(result.success).toBe(false);
      expect(result.attemptsLeft).toBe(0);
      expect(redis.del).toHaveBeenCalledWith(`otp:${MOCK_PHONE.hash}`);
      expect(prisma.otpAuditLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: OtpStatus.FAILED }) }),
      );
    });

    it('returns success and updates audit to VERIFIED on correct code', async () => {
      storedOtp('123456', 0);

      const result = await service.verify('+12025551234', '123456');

      expect(result.success).toBe(true);
      expect(redis.del).toHaveBeenCalledWith(`otp:${MOCK_PHONE.hash}`);
      expect(prisma.otpAuditLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: OtpStatus.VERIFIED }) }),
      );
    });

    it('returns failure when max attempts already reached (guard check)', async () => {
      storedOtp('654321', 3); // already at max

      const result = await service.verify('+12025551234', '654321');

      expect(result.success).toBe(false);
      expect(result.attemptsLeft).toBe(0);
      expect(redis.del).toHaveBeenCalledWith(`otp:${MOCK_PHONE.hash}`);
    });
  });
});
