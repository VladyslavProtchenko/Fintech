import { Injectable } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { CircuitBreakerService } from '../providers/circuit-breaker.service';
import { ProviderScorerService } from '../providers/provider-scorer.service';
import { PROVIDER_REGISTRY } from '../config/routing.config';

const CTX = 'MonitoringService';

export interface ProviderHealthEntry {
  provider: string;
  country: string;
  channel: string;
  circuit: string; // closed | open | half_open
  score: number; // 0.0–1.0
  successRate: number;
  avgLatencyMs: number;
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly scorer: ProviderScorerService,
    private readonly logger: AppLogger,
  ) {}

  async getProviderHealth(): Promise<ProviderHealthEntry[]> {
    this.logger.debug('Fetching provider health data', CTX, {
      providerCount: PROVIDER_REGISTRY.length,
    });

    const results = await Promise.all(
      PROVIDER_REGISTRY.map(async (entry) => {
        return Promise.all(
          entry.countries.map(async (country) => {
            try {
              const [circuit, scoreData] = await Promise.all([
                this.circuitBreaker.getState(entry.name, country),
                this.scorer.getScores([entry.name], country, entry.channel),
              ]);

              const s = scoreData[0];

              return {
                provider: entry.name,
                country,
                channel: entry.channel,
                circuit,
                score: s?.score ?? 0.5,
                successRate: s?.successRate ?? 0,
                avgLatencyMs: s?.avgLatencyMs ?? 0,
              } satisfies ProviderHealthEntry;
            } catch (err) {
              this.logger.error('Failed to fetch health for provider', err instanceof Error ? err : undefined, CTX, {
                provider: entry.name,
                country,
                error: err instanceof Error ? err.message : String(err),
              });
              // Return degraded entry instead of failing the entire response
              return {
                provider: entry.name,
                country,
                channel: entry.channel,
                circuit: 'unknown',
                score: 0,
                successRate: 0,
                avgLatencyMs: 0,
              } satisfies ProviderHealthEntry;
            }
          }),
        );
      }),
    );

    return results.flat();
  }
}
