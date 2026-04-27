import { Injectable } from '@nestjs/common';
import { CircuitBreakerService } from '../providers/circuit-breaker.service';
import { ProviderScorerService } from '../providers/provider-scorer.service';
import { PROVIDER_REGISTRY } from '../config/routing.config';

export interface ProviderHealthEntry {
  provider: string;
  country: string;
  channel: string;
  circuit: string;       // closed | open | half_open
  score: number;         // 0.0–1.0
  successRate: number;
  avgLatencyMs: number;
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly scorer: ProviderScorerService,
  ) {}

  async getProviderHealth(): Promise<ProviderHealthEntry[]> {
    const results = await Promise.all(
      PROVIDER_REGISTRY.map(async (entry) => {
        // For providers with '*' country support we report under '*'
        const countries = entry.countries;

        return Promise.all(
          countries.map(async (country) => {
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
          }),
        );
      }),
    );

    return results.flat();
  }
}
