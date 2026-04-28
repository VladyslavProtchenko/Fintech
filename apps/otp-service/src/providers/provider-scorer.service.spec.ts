import { Test } from '@nestjs/testing';
import { ProviderScorerService } from './provider-scorer.service';
import { AppLogger } from '@fintech/shared-logger';
import { REDIS_CLIENT } from '@fintech/shared-redis';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('ProviderScorerService', () => {
  let service: ProviderScorerService;
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };

    const module = await Test.createTestingModule({
      providers: [
        ProviderScorerService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(ProviderScorerService);
  });

  describe('getScore', () => {
    it('returns 0.5 (initial) when no data exists', async () => {
      await expect(service.getScore('twilio', 'US', 'SMS')).resolves.toBe(0.5);
    });

    it('returns 1.0 for perfect success rate with instant latency', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ successCount: 10, failureCount: 0, totalLatencyMs: 0 }),
      );
      const score = await service.getScore('twilio', 'US', 'SMS');
      expect(score).toBe(1.0); // 1.0 * 0.8 + 1.0 * 0.2
    });

    it('returns 0.8 for perfect success rate with slow latency', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ successCount: 10, failureCount: 0, totalLatencyMs: 150_000 }),
      );
      const score = await service.getScore('twilio', 'US', 'SMS');
      // successRate=1, avgLatency=15000 (max), speedScore=0 → 0.8*1 + 0.2*0 = 0.8
      expect(score).toBe(0.8);
    });

    it('returns 0 for 100% failure rate', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ successCount: 0, failureCount: 10, totalLatencyMs: 0 }),
      );
      const score = await service.getScore('twilio', 'US', 'SMS');
      expect(score).toBe(0);
    });
  });

  describe('recordSuccess', () => {
    it('increments successCount and adds latency', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ successCount: 2, failureCount: 1, totalLatencyMs: 1000 }),
      );
      await service.recordSuccess('twilio', 'US', 'SMS', 500);

      const saved = JSON.parse((redis.set.mock.calls[0][1] as string));
      expect(saved.successCount).toBe(3);
      expect(saved.totalLatencyMs).toBe(1500);
    });
  });

  describe('recordFailure', () => {
    it('increments failureCount', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ successCount: 5, failureCount: 0, totalLatencyMs: 2000 }),
      );
      await service.recordFailure('twilio', 'US', 'SMS');

      const saved = JSON.parse((redis.set.mock.calls[0][1] as string));
      expect(saved.failureCount).toBe(1);
    });
  });

  describe('getScores', () => {
    it('returns scores sorted by score descending', async () => {
      // getScores calls getData twice per provider (once in getScores, once inside getScore)
      redis.get.mockImplementation((key: string) => {
        if (key.includes('twilio')) return Promise.resolve(JSON.stringify({ successCount: 5, failureCount: 5, totalLatencyMs: 0 }));
        if (key.includes('msg91')) return Promise.resolve(JSON.stringify({ successCount: 10, failureCount: 0, totalLatencyMs: 0 }));
        return Promise.resolve(null);
      });

      const scores = await service.getScores(['twilio', 'msg91'], 'US', 'SMS');
      expect(scores[0].score).toBeGreaterThan(scores[1].score);
    });

    it('returns empty array for empty input', async () => {
      await expect(service.getScores([], 'US', 'SMS')).resolves.toEqual([]);
    });
  });
});
