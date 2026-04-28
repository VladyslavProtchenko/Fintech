import { Injectable, Inject } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { SmsProviderAdapter, Channel } from './adapters/provider.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ProviderScorerService } from './provider-scorer.service';
import { getProvidersForChannel } from '../config/routing.config';
import { PROVIDER_ADAPTERS } from './providers.module';

const CTX = 'ProviderRouterService';

export interface RouterSendResult {
  success: boolean;
  provider: string;
  providerRef?: string;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class ProviderRouterService {
  constructor(
    @Inject(PROVIDER_ADAPTERS) private readonly adapters: SmsProviderAdapter[],
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly scorer: ProviderScorerService,
    private readonly logger: AppLogger,
  ) {}

  async send(
    phone: string,
    message: string,
    country: string,
    channel: Channel,
  ): Promise<RouterSendResult> {
    const providers = await this.selectProviders(country, channel);

    if (providers.length === 0) {
      this.logger.warn('No available providers for routing', CTX, {
        country,
        channel,
      });
      return {
        success: false,
        provider: 'none',
        latencyMs: 0,
        error: `No providers available for ${country}/${channel}`,
      };
    }

    this.logger.debug('Starting provider failover chain', CTX, {
      country,
      channel,
      candidates: providers.map((p) => p.name),
    });

    for (const adapter of providers) {
      const available = await this.circuitBreaker.isAvailable(
        adapter.name,
        country,
      );

      if (!available) {
        this.logger.debug('Skipping provider — circuit open', CTX, {
          provider: adapter.name,
          country,
          channel,
        });
        continue;
      }

      this.logger.debug('Attempting provider', CTX, {
        provider: adapter.name,
        country,
        channel,
      });

      const result = await adapter.send(phone, message);

      if (result.success) {
        await this.circuitBreaker.recordSuccess(adapter.name, country);
        await this.scorer.recordSuccess(
          adapter.name,
          country,
          channel,
          result.latencyMs,
        );

        this.logger.log('Provider send succeeded', CTX, {
          provider: adapter.name,
          country,
          channel,
          latencyMs: result.latencyMs,
          providerRef: result.providerRef,
        });

        return {
          success: true,
          provider: adapter.name,
          providerRef: result.providerRef,
          latencyMs: result.latencyMs,
        };
      }

      await this.circuitBreaker.recordFailure(adapter.name, country);
      await this.scorer.recordFailure(adapter.name, country, channel);

      this.logger.warn('Provider send failed — trying next', CTX, {
        provider: adapter.name,
        country,
        channel,
        latencyMs: result.latencyMs,
        error: result.error,
      });
    }

    this.logger.warn('All providers exhausted', CTX, {
      country,
      channel,
      attempted: providers.map((p) => p.name),
    });

    return {
      success: false,
      provider: 'none',
      latencyMs: 0,
      error: `All providers failed for ${country}/${channel}`,
    };
  }

  // Select adapters sorted by dynamic score, filtered by availability
  private async selectProviders(
    country: string,
    channel: Channel,
  ): Promise<SmsProviderAdapter[]> {
    const names = getProvidersForChannel(country, channel);

    const candidates = names.flatMap((name) =>
      this.adapters.filter(
        (a) =>
          a.name === name &&
          a.channel === channel &&
          a.isConfigured() &&
          (a.supportedCountries.includes(country) ||
            a.supportedCountries.includes('*')),
      ),
    );

    if (candidates.length === 0) return [];

    const scores = await this.scorer.getScores(
      candidates.map((a) => a.name),
      country,
      channel,
    );

    const scoreMap = new Map(scores.map((s) => [s.provider, s.score]));

    return candidates.sort(
      (a, b) => (scoreMap.get(b.name) ?? 0.5) - (scoreMap.get(a.name) ?? 0.5),
    );
  }
}
