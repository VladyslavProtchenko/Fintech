import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { ProviderRouterService } from '../providers/provider-router.service';
import { ProviderScorerService } from '../providers/provider-scorer.service';
import { ChannelOrchestratorService } from './channel-orchestrator.service';

@Module({
  imports: [ProvidersModule],
  providers: [
    ProviderRouterService,
    ProviderScorerService,
    ChannelOrchestratorService,
  ],
  exports: [ChannelOrchestratorService, ProviderScorerService],
})
export class ChannelsModule {}
