import { Test } from '@nestjs/testing';
import { ChannelOrchestratorService } from './channel-orchestrator.service';
import { ProviderRouterService } from '../providers/provider-router.service';
import { AppLogger } from '@fintech/shared-logger';
import { Channel } from '../providers/adapters/provider.interface';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('ChannelOrchestratorService', () => {
  let service: ChannelOrchestratorService;
  let router: { send: jest.Mock };

  beforeEach(async () => {
    router = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ChannelOrchestratorService,
        { provide: ProviderRouterService, useValue: router },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(ChannelOrchestratorService);
  });

  const phone = '+12025551234';
  const message = 'Your OTP is 123456';

  describe('send', () => {
    it('returns success on first channel success', async () => {
      router.send.mockResolvedValue({
        success: true,
        provider: 'twilio',
        providerRef: 'ref-1',
        latencyMs: 200,
        error: undefined,
      });

      const result = await service.send(phone, message, 'US');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('twilio');
      expect(result.failoverChain).toHaveLength(1);
      // Only first channel tried
      expect(router.send).toHaveBeenCalledTimes(1);
    });

    it('tries next channel when first channel fails', async () => {
      router.send
        .mockResolvedValueOnce({ success: false, provider: 'twilio', latencyMs: 100, error: 'timeout' })
        .mockResolvedValueOnce({ success: true, provider: 'twilio', providerRef: 'ref-2', latencyMs: 150 });

      const result = await service.send(phone, message, 'US');

      expect(result.success).toBe(true);
      expect(result.failoverChain).toHaveLength(2);
      expect(router.send).toHaveBeenCalledTimes(2);
    });

    it('returns failure when all channels fail', async () => {
      router.send.mockResolvedValue({ success: false, provider: 'none', latencyMs: 0, error: 'all failed' });

      const result = await service.send(phone, message, 'US');

      expect(result.success).toBe(false);
      // 'US' has [SMS, VOICE] channels (from CHANNEL_PRIORITY)
      expect(result.failoverChain.length).toBeGreaterThanOrEqual(1);
    });

    it('includes all attempted channels in failoverChain', async () => {
      router.send.mockResolvedValue({ success: false, provider: 'none', latencyMs: 0, error: 'err' });

      const result = await service.send(phone, message, 'IN');

      // IN has [SMS, WHATSAPP, VOICE]
      expect(result.failoverChain.length).toBe(3);
    });

    it('returns correct channel in result', async () => {
      router.send.mockResolvedValue({
        success: true, provider: 'msg91', providerRef: 'r', latencyMs: 100,
      });

      const result = await service.send(phone, message, 'IN');
      expect(result.channel).toBe(Channel.SMS);
    });
  });
});
