import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppLogger } from '@fintech/shared-logger';
import { REDIS_CLIENT } from '@fintech/shared-redis';

const CTX = 'CircuitBreakerService';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitData {
  state: CircuitState;
  failureCount: number;
  openedAt: number | null; // unix ms
}

const FAILURE_THRESHOLD = 5; // consecutive failures before OPEN
const COOLDOWN_MS = 60_000;  // 60s before HALF_OPEN
const TTL_SECONDS = 3600;

@Injectable()
export class CircuitBreakerService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  async isAvailable(provider: string, country: string): Promise<boolean> {
    const data = await this.get(provider, country);

    if (data.state === CircuitState.CLOSED) return true;

    if (data.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (data.openedAt ?? 0);
      if (elapsed >= COOLDOWN_MS) {
        await this.transitionTo(provider, country, CircuitState.HALF_OPEN, data);
        return true; // allow one test request
      }
      this.logger.debug('Circuit OPEN — provider skipped', CTX, {
        provider,
        country,
        cooldownRemainingMs: COOLDOWN_MS - elapsed,
      });
      return false;
    }

    // HALF_OPEN: one request already let through, block until result
    return false;
  }

  async recordSuccess(provider: string, country: string): Promise<void> {
    const data = await this.get(provider, country);

    if (data.state !== CircuitState.CLOSED) {
      this.logger.log('Circuit CLOSED — provider recovered', CTX, {
        provider,
        country,
        previousState: data.state,
      });
    }

    await this.set(provider, country, {
      state: CircuitState.CLOSED,
      failureCount: 0,
      openedAt: null,
    });
  }

  async recordFailure(provider: string, country: string): Promise<void> {
    const data = await this.get(provider, country);
    const failureCount = data.failureCount + 1;

    if (
      failureCount >= FAILURE_THRESHOLD ||
      data.state === CircuitState.HALF_OPEN
    ) {
      this.logger.warn('Circuit OPEN — failure threshold reached', CTX, {
        provider,
        country,
        failureCount,
        threshold: FAILURE_THRESHOLD,
        cooldownMs: COOLDOWN_MS,
      });
      await this.set(provider, country, {
        state: CircuitState.OPEN,
        failureCount,
        openedAt: Date.now(),
      });
    } else {
      this.logger.debug('Circuit failure recorded', CTX, {
        provider,
        country,
        failureCount,
        threshold: FAILURE_THRESHOLD,
      });
      await this.set(provider, country, { ...data, failureCount });
    }
  }

  async getState(provider: string, country: string): Promise<CircuitState> {
    const data = await this.get(provider, country);
    return data.state;
  }

  private async get(provider: string, country: string): Promise<CircuitData> {
    try {
      const raw = await this.redis.get(this.key(provider, country));
      if (!raw) {
        return { state: CircuitState.CLOSED, failureCount: 0, openedAt: null };
      }
      return JSON.parse(raw) as CircuitData;
    } catch (err) {
      // Fail open: if Redis is down, don't block all providers
      this.logger.error('Failed to read circuit breaker state — failing open', err instanceof Error ? err : undefined, CTX, {
        provider,
        country,
        error: err instanceof Error ? err.message : String(err),
      });
      return { state: CircuitState.CLOSED, failureCount: 0, openedAt: null };
    }
  }

  private async set(
    provider: string,
    country: string,
    data: CircuitData,
  ): Promise<void> {
    try {
      await this.redis.set(
        this.key(provider, country),
        JSON.stringify(data),
        'EX',
        TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error('Failed to persist circuit breaker state', err instanceof Error ? err : undefined, CTX, {
        provider,
        country,
        state: data.state,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async transitionTo(
    provider: string,
    country: string,
    state: CircuitState,
    current: CircuitData,
  ): Promise<void> {
    this.logger.log('Circuit state transition', CTX, {
      provider,
      country,
      from: current.state,
      to: state,
    });
    await this.set(provider, country, { ...current, state });
  }

  private key(provider: string, country: string): string {
    return `circuit:${provider}:${country}`;
  }
}
