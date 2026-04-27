import { Injectable, Logger } from '@nestjs/common';
import { GeminiOcrService } from './gemini-ocr.service';

export type MergeStrategy = 'direct' | 'gemini-arbitrated';

export interface MergeResult {
  mergedText: string;
  confidenceScore: number;
  strategy: MergeStrategy;
  selectedSource: 'paddle' | 'surya' | null;
}

const SIMILARITY_THRESHOLD = 0.9;

// Strips HTML tags and normalizes whitespace for fair comparison
const STRIP_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

@Injectable()
export class TextMergeService {
  private readonly logger = new Logger(TextMergeService.name);

  constructor(private readonly gemini: GeminiOcrService) {}

  async merge(paddleText: string, suryaText: string): Promise<MergeResult> {
    const wordsA = this.tokenize(paddleText);
    const wordsB = this.tokenize(suryaText);
    const similarity = this.jaccardSimilarity(wordsA, wordsB);
    this.logger.log(`Text similarity (Jaccard): ${(similarity * 100).toFixed(1)}%`);

    if (similarity >= SIMILARITY_THRESHOLD) {
      const selected = this.selectBetterText(paddleText, suryaText);
      return {
        mergedText: selected.text,
        confidenceScore: similarity,
        strategy: 'direct',
        selectedSource: selected.source,
      };
    }

    this.logger.log(`Similarity below threshold ��� calling Gemini to merge`);
    const mergedText = await this.gemini.mergeTexts(paddleText, suryaText);
    return {
      mergedText,
      confidenceScore: similarity,
      strategy: 'gemini-arbitrated',
      selectedSource: null,
    };
  }

  private tokenize(text: string): Set<string> {
    const cleaned = text
      .replace(STRIP_RE, ' ')
      .replace(WHITESPACE_RE, ' ')
      .trim()
      .toLowerCase();

    return new Set(cleaned.split(' ').filter(Boolean));
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;

    for (const word of smaller) {
      if (larger.has(word)) intersection++;
    }

    const union = a.size + b.size - intersection;
    return intersection / union;
  }

  private selectBetterText(
    paddleText: string,
    suryaText: string,
  ): { text: string; source: 'paddle' | 'surya' } {
    // Prefer longer text — more content extracted
    if (suryaText.length > paddleText.length) {
      return { text: suryaText, source: 'surya' };
    }
    return { text: paddleText, source: 'paddle' };
  }
}
