import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

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

const FAILURE_THRESHOLD = 5;   // consecutive failures before OPEN
const COOLDOWN_MS = 60_000;    // 60s before HALF_OPEN
const TTL_SECONDS = 3600;

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isAvailable(provider: string, country: string): Promise<boolean> {
    const data = await this.get(provider, country);

    if (data.state === CircuitState.CLOSED) return true;

    if (data.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (data.openedAt ?? 0);
      if (elapsed >= COOLDOWN_MS) {
        await this.transitionTo(provider, country, CircuitState.HALF_OPEN, data);
        return true; // allow one test request
      }
      return false;
    }

    // HALF_OPEN: one request already let through, block until result
    return false;
  }

  async recordSuccess(provider: string, country: string): Promise<void> {
    const data = await this.get(provider, country);
    if (data.state !== CircuitState.CLOSED) {
      this.logger.log(`Circuit CLOSED for ${provider}/${country}`);
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

    if (failureCount >= FAILURE_THRESHOLD || data.state === CircuitState.HALF_OPEN) {
      this.logger.warn(
        `Circuit OPEN for ${provider}/${country} after ${failureCount} failures`,
      );
      await this.set(provider, country, {
        state: CircuitState.OPEN,
        failureCount,
        openedAt: Date.now(),
      });
    } else {
      await this.set(provider, country, {
        ...data,
        failureCount,
      });
    }
  }

  async getState(provider: string, country: string): Promise<CircuitState> {
    const data = await this.get(provider, country);
    return data.state;
  }

  private async get(provider: string, country: string): Promise<CircuitData> {
    const raw = await this.redis.get(this.key(provider, country));
    if (!raw) {
      return { state: CircuitState.CLOSED, failureCount: 0, openedAt: null };
    }
    return JSON.parse(raw) as CircuitData;
  }

  private async set(
    provider: string,
    country: string,
    data: CircuitData,
  ): Promise<void> {
    await this.redis.set(
      this.key(provider, country),
      JSON.stringify(data),
      'EX',
      TTL_SECONDS,
    );
  }

  private async transitionTo(
    provider: string,
    country: string,
    state: CircuitState,
    current: CircuitData,
  ): Promise<void> {
    this.logger.log(`Circuit ${state.toUpperCase()} for ${provider}/${country}`);
    await this.set(provider, country, { ...current, state });
  }

  private key(provider: string, country: string): string {
    return `circuit:${provider}:${country}`;
  }
}
