import { Injectable } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { Channel } from '../providers/adapters/provider.interface';
import { ProviderRouterService } from '../providers/provider-router.service';
import { getChannelPriority } from '../config/routing.config';

const CTX = 'ChannelOrchestratorService';

export interface FailoverEntry {
  channel: Channel;
  provider: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}

export interface OrchestratorResult {
  success: boolean;
  channel?: Channel;
  provider?: string;
  providerRef?: string;
  latencyMs?: number;
  failoverChain: FailoverEntry[];
}

@Injectable()
export class ChannelOrchestratorService {
  constructor(
    private readonly router: ProviderRouterService,
    private readonly logger: AppLogger,
  ) {}

  async send(
    phone: string,
    message: string,
    country: string,
  ): Promise<OrchestratorResult> {
    const channels = getChannelPriority(country);
    const failoverChain: FailoverEntry[] = [];

    this.logger.debug('Starting channel orchestration', CTX, {
      country,
      channelPriority: channels,
    });

    for (const channel of channels) {
      this.logger.debug('Trying channel', CTX, { channel, country });

      const result = await this.router.send(phone, message, country, channel);

      failoverChain.push({
        channel,
        provider: result.provider,
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      });

      if (result.success) {
        this.logger.log('Message delivered', CTX, {
          channel,
          provider: result.provider,
          country,
          latencyMs: result.latencyMs,
        });
        return {
          success: true,
          channel,
          provider: result.provider,
          providerRef: result.providerRef,
          latencyMs: result.latencyMs,
          failoverChain,
        };
      }

      this.logger.warn('Channel failed — trying next', CTX, {
        channel,
        country,
        error: result.error,
      });
    }

    this.logger.error('All channels failed', undefined, CTX, {
      country,
      failoverChain: failoverChain.map((e) => ({
        channel: e.channel,
        provider: e.provider,
        error: e.error,
      })),
    });

    return { success: false, failoverChain };
  }
}
