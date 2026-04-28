import { Test } from '@nestjs/testing';
import { AppLogger } from '@fintech/shared-logger';
import { TextMergeService } from './text-merge.service';
import { GeminiOcrService } from './gemini-ocr.service';

const MOCK_GEMINI_RESULT = 'merged by gemini';

const mockLogger = {
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('TextMergeService', () => {
  let service: TextMergeService;
  let gemini: { mergeTexts: jest.Mock };

  beforeEach(async () => {
    gemini = { mergeTexts: jest.fn().mockResolvedValue(MOCK_GEMINI_RESULT) };

    const module = await Test.createTestingModule({
      providers: [
        TextMergeService,
        { provide: GeminiOcrService, useValue: gemini },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get(TextMergeService);
  });

  describe('high similarity (>= 0.9) — direct strategy', () => {
    it('returns direct strategy without calling Gemini', async () => {
      const text = 'coffee latte 3.50 total 3.50';
      const result = await service.merge(text, text);

      expect(result.strategy).toBe('direct');
      expect(result.mergedText).toBe(text);
      expect(result.confidenceScore).toBe(1);
      expect(gemini.mergeTexts).not.toHaveBeenCalled();
    });

    it('selects surya when surya text is longer', async () => {
      // 10 shared words + 1 extra in surya → Jaccard = 10/11 ≈ 0.91 >= 0.9
      const shared =
        'coffee latte espresso tea milk sugar cream total price tax';
      const paddle = shared;
      const surya = shared + ' receipt';
      const result = await service.merge(paddle, surya);

      expect(result.strategy).toBe('direct');
      expect(result.selectedSource).toBe('surya');
      expect(result.mergedText).toBe(surya);
    });

    it('selects paddle when paddle text is longer', async () => {
      // 10 shared words + 1 extra in paddle → Jaccard = 10/11 ≈ 0.91 >= 0.9
      const shared =
        'coffee latte espresso tea milk sugar cream total price tax';
      const paddle = shared + ' receipt';
      const surya = shared;
      const result = await service.merge(paddle, surya);

      expect(result.strategy).toBe('direct');
      expect(result.selectedSource).toBe('paddle');
      expect(result.mergedText).toBe(paddle);
    });

    it('ignores HTML tags from Paddle when computing similarity', async () => {
      const paddle = '<table><tr><td>total</td><td>10.00</td></tr></table>';
      const surya = 'total 10.00';
      const result = await service.merge(paddle, surya);

      // After stripping HTML, both become "total 10.00" — identical → direct
      expect(result.strategy).toBe('direct');
      expect(gemini.mergeTexts).not.toHaveBeenCalled();
    });
  });

  describe('low similarity (< 0.9) — gemini-arbitrated strategy', () => {
    it('calls Gemini and returns merged text', async () => {
      const paddle = 'apple banana cherry date elderberry';
      const surya = 'fig grape honeydew kiwi lemon mango';
      const result = await service.merge(paddle, surya);

      expect(result.strategy).toBe('gemini-arbitrated');
      expect(result.mergedText).toBe(MOCK_GEMINI_RESULT);
      expect(result.selectedSource).toBeNull();
      expect(gemini.mergeTexts).toHaveBeenCalledWith(paddle, surya);
    });

    it('returns similarity score even when using gemini', async () => {
      const paddle = 'completely different text here';
      const surya = 'nothing matches at all zero';
      const result = await service.merge(paddle, surya);

      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThan(0.9);
    });
  });

  describe('edge cases', () => {
    it('both texts empty → similarity 1 → direct', async () => {
      const result = await service.merge('', '');

      expect(result.strategy).toBe('direct');
      expect(result.confidenceScore).toBe(1);
      expect(gemini.mergeTexts).not.toHaveBeenCalled();
    });

    it('one text empty → similarity 0 → gemini', async () => {
      const result = await service.merge('some text here', '');

      expect(result.strategy).toBe('gemini-arbitrated');
      expect(result.confidenceScore).toBe(0);
      expect(gemini.mergeTexts).toHaveBeenCalled();
    });
  });
});
