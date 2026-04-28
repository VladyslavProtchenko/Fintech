import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppLogger } from '@fintech/shared-logger';
import { REDIS_CLIENT } from '@fintech/shared-redis';

const CTX = 'ProviderScorerService';

export interface ProviderScore {
  provider: string;
  country: string;
  channel: string;
  score: number; // 0.0 - 1.0
  successRate: number;
  avgLatencyMs: number;
}

interface ScoreData {
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
}

const INITIAL_SCORE = 0.5;
const MAX_LATENCY_MS = 15_000;
const TTL_SECONDS = 3600; // 1 hour sliding window

@Injectable()
export class ProviderScorerService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  async recordSuccess(
    provider: string,
    country: string,
    channel: string,
    latencyMs: number,
  ): Promise<void> {
    const key = this.key(provider, country, channel);
    const data = await this.getData(key);

    const updated = {
      successCount: data.successCount + 1,
      failureCount: data.failureCount,
      totalLatencyMs: data.totalLatencyMs + latencyMs,
    };

    await this.setData(key, updated);

    const total = updated.successCount + updated.failureCount;
    this.logger.debug('Provider score updated — success', CTX, {
      provider,
      country,
      channel,
      latencyMs,
      successRate: (updated.successCount / total).toFixed(2),
      totalRequests: total,
    });
  }

  async recordFailure(
    provider: string,
    country: string,
    channel: string,
  ): Promise<void> {
    const key = this.key(provider, country, channel);
    const data = await this.getData(key);

    const updated = { ...data, failureCount: data.failureCount + 1 };
    await this.setData(key, updated);

    const total = updated.successCount + updated.failureCount;
    this.logger.debug('Provider score updated — failure', CTX, {
      provider,
      country,
      channel,
      successRate: total > 0 ? (updated.successCount / total).toFixed(2) : '0',
      totalRequests: total,
    });
  }

  async getScore(
    provider: string,
    country: string,
    channel: string,
  ): Promise<number> {
    const key = this.key(provider, country, channel);
    const data = await this.getData(key);

    const total = data.successCount + data.failureCount;
    if (total === 0) return INITIAL_SCORE;

    const successRate = data.successCount / total;
    const avgLatency =
      data.successCount > 0
        ? data.totalLatencyMs / data.successCount
        : MAX_LATENCY_MS;

    const speedScore = Math.max(0, 1 - avgLatency / MAX_LATENCY_MS);

    // score = successRate * 0.8 + speedScore * 0.2
    return successRate * 0.8 + speedScore * 0.2;
  }

  async getScores(
    providers: string[],
    country: string,
    channel: string,
  ): Promise<ProviderScore[]> {
    const scores = await Promise.all(
      providers.map(async (provider) => {
        const key = this.key(provider, country, channel);
        const data = await this.getData(key);
        const total = data.successCount + data.failureCount;
        const score = await this.getScore(provider, country, channel);
        const avgLatencyMs =
          data.successCount > 0
            ? Math.round(data.totalLatencyMs / data.successCount)
            : 0;

        return {
          provider,
          country,
          channel,
          score,
          successRate: total > 0 ? data.successCount / total : 0,
          avgLatencyMs,
        };
      }),
    );

    return scores.sort((a, b) => b.score - a.score);
  }

  private async getData(key: string): Promise<ScoreData> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return { successCount: 0, failureCount: 0, totalLatencyMs: 0 };
      return JSON.parse(raw) as ScoreData;
    } catch (err) {
      // Return neutral score data on Redis failure
      this.logger.error('Failed to read provider score from Redis', err instanceof Error ? err : undefined, CTX, {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return { successCount: 0, failureCount: 0, totalLatencyMs: 0 };
    }
  }

  private async setData(key: string, data: ScoreData): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', TTL_SECONDS);
    } catch (err) {
      // Non-fatal: scores may be stale but routing still works
      this.logger.error('Failed to persist provider score to Redis', err instanceof Error ? err : undefined, CTX, {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private key(provider: string, country: string, channel: string): string {
    return `score:${provider}:${country}:${channel}`;
  }
}
