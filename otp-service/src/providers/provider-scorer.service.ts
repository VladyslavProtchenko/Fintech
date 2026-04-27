import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

export interface ProviderScore {
  provider: string;
  country: string;
  channel: string;
  score: number;       // 0.0 - 1.0
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
  private readonly logger = new Logger(ProviderScorerService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async recordSuccess(
    provider: string,
    country: string,
    channel: string,
    latencyMs: number,
  ): Promise<void> {
    const key = this.key(provider, country, channel);
    const data = await this.getData(key);

    await this.setData(key, {
      successCount: data.successCount + 1,
      failureCount: data.failureCount,
      totalLatencyMs: data.totalLatencyMs + latencyMs,
    });
  }

  async recordFailure(
    provider: string,
    country: string,
    channel: string,
  ): Promise<void> {
    const key = this.key(provider, country, channel);
    const data = await this.getData(key);

    await this.setData(key, {
      ...data,
      failureCount: data.failureCount + 1,
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
    const raw = await this.redis.get(key);
    if (!raw) return { successCount: 0, failureCount: 0, totalLatencyMs: 0 };
    return JSON.parse(raw) as ScoreData;
  }

  private async setData(key: string, data: ScoreData): Promise<void> {
    await this.redis.set(key, JSON.stringify(data), 'EX', TTL_SECONDS);
  }

  private key(provider: string, country: string, channel: string): string {
    return `score:${provider}:${country}:${channel}`;
  }
}
