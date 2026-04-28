import { Test } from '@nestjs/testing';
import { ProviderRouterService } from './provider-router.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ProviderScorerService } from './provider-scorer.service';
import { AppLogger } from '@fintech/shared-logger';
import { PROVIDER_ADAPTERS } from './providers.module';
import { Channel, SmsProviderAdapter } from './adapters/provider.interface';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeAdapter(name: string, channel: Channel, configured = true): SmsProviderAdapter {
  return {
    name,
    channel,
    supportedCountries: ['*'],
    send: jest.fn(),
    supportsDlr: jest.fn().mockReturnValue(false),
    isConfigured: jest.fn().mockReturnValue(configured),
  };
}

describe('ProviderRouterService', () => {
  let service: ProviderRouterService;
  let circuitBreaker: { isAvailable: jest.Mock; recordSuccess: jest.Mock; recordFailure: jest.Mock };
  let scorer: { getScores: jest.Mock; recordSuccess: jest.Mock; recordFailure: jest.Mock };
  let adapters: SmsProviderAdapter[];

  beforeEach(async () => {
    circuitBreaker = {
      isAvailable: jest.fn().mockResolvedValue(true),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };
    scorer = {
      getScores: jest.fn().mockResolvedValue([]),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    // 'twilio' SMS adapter — matches getProvidersForChannel('US', SMS)
    adapters = [makeAdapter('twilio', Channel.SMS)];

    const module = await Test.createTestingModule({
      providers: [
        ProviderRouterService,
        { provide: PROVIDER_ADAPTERS, useValue: adapters },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
        { provide: ProviderScorerService, useValue: scorer },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(ProviderRouterService);
  });

  describe('send', () => {
    it('returns success when provider succeeds', async () => {
      (adapters[0].send as jest.Mock).mockResolvedValue({ success: true, latencyMs: 200, providerRef: 'ref-1' });

      const result = await service.send('+12025551234', 'Your OTP', 'US', Channel.SMS);

      expect(result.success).toBe(true);
      expect(result.provider).toBe('twilio');
      expect(result.providerRef).toBe('ref-1');
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('twilio', 'US');
    });

    it('records failure and returns failure when provider fails', async () => {
      (adapters[0].send as jest.Mock).mockResolvedValue({ success: false, latencyMs: 100, error: 'timeout' });

      const result = await service.send('+12025551234', 'msg', 'US', Channel.SMS);

      expect(result.success).toBe(false);
      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith('twilio', 'US');
    });

    it('skips provider when circuit is open', async () => {
      circuitBreaker.isAvailable.mockResolvedValue(false);

      const result = await service.send('+12025551234', 'msg', 'US', Channel.SMS);

      expect(result.success).toBe(false);
      expect(adapters[0].send).not.toHaveBeenCalled();
    });

    it('returns failure when no adapters are configured', async () => {
      (adapters[0].isConfigured as jest.Mock).mockReturnValue(false);

      const result = await service.send('+12025551234', 'msg', 'US', Channel.SMS);

      expect(result.success).toBe(false);
      expect(result.provider).toBe('none');
    });

    it('tries next provider when first fails (failover)', async () => {
      const adapter2 = makeAdapter('twilio', Channel.SMS);
      (adapters[0].send as jest.Mock).mockResolvedValue({ success: false, latencyMs: 100, error: 'err' });
      (adapter2.send as jest.Mock).mockResolvedValue({ success: true, latencyMs: 150, providerRef: 'ref-2' });

      // Provide two adapters with the same name 'twilio' so both are candidates
      const module = await Test.createTestingModule({
        providers: [
          ProviderRouterService,
          { provide: PROVIDER_ADAPTERS, useValue: [adapters[0], adapter2] },
          { provide: CircuitBreakerService, useValue: circuitBreaker },
          { provide: ProviderScorerService, useValue: scorer },
          { provide: AppLogger, useValue: mockLogger },
        ],
      }).compile();

      const svc = module.get(ProviderRouterService);
      const result = await svc.send('+12025551234', 'msg', 'US', Channel.SMS);
      expect(result.success).toBe(true);
    });
  });
});
