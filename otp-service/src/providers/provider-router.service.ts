import { Injectable, Inject, Logger } from '@nestjs/common';
import { SmsProviderAdapter, Channel, SendResult } from './adapters/provider.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ProviderScorerService } from './provider-scorer.service';
import { getProvidersForChannel } from '../config/routing.config';
import { PROVIDER_ADAPTERS } from './providers.module';

export interface RouterSendResult {
  success: boolean;
  provider: string;
  providerRef?: string;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class ProviderRouterService {
  private readonly logger = new Logger(ProviderRouterService.name);

  constructor(
    @Inject(PROVIDER_ADAPTERS) private readonly adapters: SmsProviderAdapter[],
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly scorer: ProviderScorerService,
  ) {}

  async send(
    phone: string,
    message: string,
    country: string,
    channel: Channel,
  ): Promise<RouterSendResult> {
    const providers = await this.selectProviders(country, channel);

    if (providers.length === 0) {
      this.logger.warn(`No available providers for ${country}/${channel}`);
      return {
        success: false,
        provider: 'none',
        latencyMs: 0,
        error: `No providers available for ${country}/${channel}`,
      };
    }

    for (const adapter of providers) {
      const available = await this.circuitBreaker.isAvailable(
        adapter.name,
        country,
      );

      if (!available) {
        this.logger.debug(`Circuit open, skipping ${adapter.name}/${country}`);
        continue;
      }

      this.logger.debug(`Trying ${adapter.name} for ${country}/${channel}`);
      const result = await adapter.send(phone, message);

      if (result.success) {
        await this.circuitBreaker.recordSuccess(adapter.name, country);
        await this.scorer.recordSuccess(
          adapter.name,
          country,
          channel,
          result.latencyMs,
        );
        return {
          success: true,
          provider: adapter.name,
          providerRef: result.providerRef,
          latencyMs: result.latencyMs,
        };
      }

      await this.circuitBreaker.recordFailure(adapter.name, country);
      await this.scorer.recordFailure(adapter.name, country, channel);
      this.logger.warn(
        `${adapter.name} failed for ${country}/${channel}: ${result.error}`,
      );
    }

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

    // Get adapters matching names, configured, and supporting this country
    const candidates = names
      .flatMap((name) =>
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

    // Sort by dynamic score
    const scores = await this.scorer.getScores(
      candidates.map((a) => a.name),
      country,
      channel,
    );

    const scoreMap = new Map(scores.map((s) => [s.provider, s.score]));

    return candidates.sort(
      (a, b) =>
        (scoreMap.get(b.name) ?? 0.5) - (scoreMap.get(a.name) ?? 0.5),
    );
  }
}
