import { Injectable, Logger } from '@nestjs/common';
import { Channel } from '../providers/adapters/provider.interface';
import { ProviderRouterService } from '../providers/provider-router.service';
import { getChannelPriority } from '../config/routing.config';

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
  private readonly logger = new Logger(ChannelOrchestratorService.name);

  constructor(private readonly router: ProviderRouterService) {}

  async send(
    phone: string,
    message: string,
    country: string,
  ): Promise<OrchestratorResult> {
    const channels = getChannelPriority(country);
    const failoverChain: FailoverEntry[] = [];

    for (const channel of channels) {
      this.logger.debug(`Trying channel ${channel} for ${country}`);

      const result = await this.router.send(phone, message, country, channel);

      failoverChain.push({
        channel,
        provider: result.provider,
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      });

      if (result.success) {
        this.logger.log(
          `Delivered via ${channel}/${result.provider} in ${result.latencyMs}ms`,
        );
        return {
          success: true,
          channel,
          provider: result.provider,
          providerRef: result.providerRef,
          latencyMs: result.latencyMs,
          failoverChain,
        };
      }

      this.logger.warn(
        `Channel ${channel} failed for ${country}: ${result.error}`,
      );
    }

    this.logger.error(`All channels failed for ${country}`);
    return { success: false, failoverChain };
  }
}
