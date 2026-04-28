import { Test } from '@nestjs/testing';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';
import { AppLogger } from '@fintech/shared-logger';
import { REDIS_CLIENT } from '@fintech/shared-redis';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    redis = { get: jest.fn(), set: jest.fn().mockResolvedValue('OK') };

    const module = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(CircuitBreakerService);
  });

  const provider = 'twilio';
  const country = 'US';

  function storedState(state: CircuitState, failureCount: number, openedAt: number | null) {
    redis.get.mockResolvedValue(JSON.stringify({ state, failureCount, openedAt }));
  }

  describe('isAvailable', () => {
    it('returns true when circuit is CLOSED', async () => {
      storedState(CircuitState.CLOSED, 0, null);
      await expect(service.isAvailable(provider, country)).resolves.toBe(true);
    });

    it('returns true when no stored state (fresh / CLOSED by default)', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.isAvailable(provider, country)).resolves.toBe(true);
    });

    it('returns false when circuit is OPEN within cooldown window', async () => {
      storedState(CircuitState.OPEN, 5, Date.now() - 10_000); // 10s ago < 60s cooldown
      await expect(service.isAvailable(provider, country)).resolves.toBe(false);
    });

    it('returns true and transitions to HALF_OPEN after cooldown expires', async () => {
      storedState(CircuitState.OPEN, 5, Date.now() - 61_000); // 61s ago > 60s cooldown
      await expect(service.isAvailable(provider, country)).resolves.toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(CircuitState.HALF_OPEN),
        expect.any(String),
        expect.any(Number),
      );
    });

    it('returns false when circuit is HALF_OPEN (test request already in flight)', async () => {
      storedState(CircuitState.HALF_OPEN, 5, Date.now());
      await expect(service.isAvailable(provider, country)).resolves.toBe(false);
    });

    it('fails open (returns true) when Redis is down', async () => {
      redis.get.mockRejectedValue(new Error('redis connection refused'));
      await expect(service.isAvailable(provider, country)).resolves.toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('resets circuit to CLOSED with 0 failures', async () => {
      storedState(CircuitState.OPEN, 5, Date.now());
      await service.recordSuccess(provider, country);

      const setCall = redis.set.mock.calls[0];
      const written = JSON.parse(setCall[1] as string);
      expect(written.state).toBe(CircuitState.CLOSED);
      expect(written.failureCount).toBe(0);
    });
  });

  describe('recordFailure', () => {
    it('increments failure count when below threshold', async () => {
      storedState(CircuitState.CLOSED, 2, null);
      await service.recordFailure(provider, country);

      const written = JSON.parse((redis.set.mock.calls[0][1] as string));
      expect(written.failureCount).toBe(3);
      expect(written.state).toBe(CircuitState.CLOSED);
    });

    it('opens circuit when failure threshold (5) is reached', async () => {
      storedState(CircuitState.CLOSED, 4, null);
      await service.recordFailure(provider, country);

      const written = JSON.parse((redis.set.mock.calls[0][1] as string));
      expect(written.state).toBe(CircuitState.OPEN);
      expect(written.openedAt).toBeGreaterThan(0);
    });

    it('opens circuit again on HALF_OPEN failure', async () => {
      storedState(CircuitState.HALF_OPEN, 5, Date.now());
      await service.recordFailure(provider, country);

      const written = JSON.parse((redis.set.mock.calls[0][1] as string));
      expect(written.state).toBe(CircuitState.OPEN);
    });
  });
});
