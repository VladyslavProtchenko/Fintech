import { Test } from '@nestjs/testing';
import { GeminiFraudAnalyzer } from './gemini-fraud.analyzer';
import { GeminiClientService } from '../../queue/services/gemini-client.service';
import { AppLogger } from '@fintech/shared-logger';

const mockLogger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const IMAGE_BUFFER = Buffer.from('fake-image');

function makeGeminiResponse(text: string) {
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        finishReason: 'STOP',
      },
    ],
  };
}

describe('GeminiFraudAnalyzer', () => {
  let analyzer: GeminiFraudAnalyzer;
  let generateContent: jest.Mock;

  beforeEach(async () => {
    generateContent = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        GeminiFraudAnalyzer,
        {
          provide: GeminiClientService,
          useValue: {
            client: { models: { generateContent } },
          },
        },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    analyzer = module.get(GeminiFraudAnalyzer);
    jest.clearAllMocks();
  });

  describe('when Gemini client is unavailable', () => {
    it('returns skipped result without calling API', async () => {
      const module = await Test.createTestingModule({
        providers: [
          GeminiFraudAnalyzer,
          { provide: GeminiClientService, useValue: { client: null } },
          { provide: AppLogger, useValue: mockLogger },
        ],
      }).compile();

      const result = await module.get(GeminiFraudAnalyzer).analyze(IMAGE_BUFFER);

      expect(result.skipped).toBe(true);
      expect(result.score).toBe(0);
    });
  });

  describe('response parsing', () => {
    it('returns score = confidence when tampered=true', async () => {
      generateContent.mockResolvedValue(
        makeGeminiResponse(
          JSON.stringify({ tampered: true, confidence: 0.85, flags: ['overlay artifact'], analysis: 'edited' }),
        ),
      );

      const result = await analyzer.analyze(IMAGE_BUFFER);

      expect(result.score).toBeCloseTo(0.85);
      expect(result.confidence).toBeCloseTo(0.85);
      expect(result.flags).toEqual(['overlay artifact']);
      expect(result.analysis).toBe('edited');
      expect(result.skipped).toBe(false);
    });

    it('returns score = 0 when tampered=false regardless of confidence', async () => {
      generateContent.mockResolvedValue(
        makeGeminiResponse(
          JSON.stringify({ tampered: false, confidence: 0.7, flags: [], analysis: 'looks authentic' }),
        ),
      );

      const result = await analyzer.analyze(IMAGE_BUFFER);

      expect(result.score).toBe(0);
      expect(result.confidence).toBeCloseTo(0.7);
      expect(result.skipped).toBe(false);
    });

    it('strips markdown code fences before parsing', async () => {
      generateContent.mockResolvedValue(
        makeGeminiResponse(
          '```json\n' +
            JSON.stringify({ tampered: true, confidence: 0.6, flags: ['font mismatch'], analysis: 'tampered' }) +
            '\n```',
        ),
      );

      const result = await analyzer.analyze(IMAGE_BUFFER);

      expect(result.score).toBeCloseTo(0.6);
      expect(result.flags).toEqual(['font mismatch']);
    });

    it('returns clean fallback on unparseable JSON', async () => {
      generateContent.mockResolvedValue(makeGeminiResponse('this is not JSON at all'));

      const result = await analyzer.analyze(IMAGE_BUFFER);

      expect(result.score).toBe(0);
      expect(result.skipped).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('filters out non-string items from flags array', async () => {
      generateContent.mockResolvedValue(
        makeGeminiResponse(
          JSON.stringify({ tampered: true, confidence: 0.5, flags: ['valid flag', 42, null], analysis: '' }),
        ),
      );

      const result = await analyzer.analyze(IMAGE_BUFFER);

      expect(result.flags).toEqual(['valid flag']);
    });
  });

  describe('API errors', () => {
    it('returns skipped clean fallback on API error', async () => {
      generateContent.mockRejectedValue(new Error('Network timeout'));

      const result = await analyzer.analyze(IMAGE_BUFFER);

      expect(result.score).toBe(0);
      expect(result.skipped).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
