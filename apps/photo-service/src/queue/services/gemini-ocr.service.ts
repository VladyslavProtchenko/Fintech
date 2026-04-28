import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { AppLogger } from '@fintech/shared-logger';
import { GeminiClientService } from './gemini-client.service';

const CTX = 'GeminiOcrService';

@Injectable()
export class GeminiOcrService {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly logger: AppLogger,
  ) {}

  get isAvailable(): boolean {
    return this.gemini.isAvailable;
  }

  async extractText(imagePath: string): Promise<string> {
    if (!this.gemini.client) throw new Error('GEMINI_API_KEY is not set');
    const start = Date.now();

    this.logger.debug('Gemini extractText started', CTX, { imagePath });

    try {
      const imageData = await readFile(imagePath);
      const base64 = imageData.toString('base64');

      const response = await this.gemini.client!.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64,
                },
              },
              {
                text: 'Extract ALL text from this receipt image exactly as it appears. Return only the raw text, no formatting, no markdown, no commentary. Preserve the original language, numbers, and layout structure.',
              },
            ],
          },
        ],
      });

      const text =
        response.candidates?.[0]?.content?.parts
          ?.filter((p) => p.text)
          .map((p) => p.text)
          .join('\n') ?? '';

      const result = text.trim();

      this.logger.debug('Gemini extractText completed', CTX, {
        imagePath,
        textLength: result.length,
        durationMs: Date.now() - start,
        finishReason: response.candidates?.[0]?.finishReason,
      });

      return result;
    } catch (err) {
      this.logger.error('Gemini extractText failed', err instanceof Error ? err : undefined, CTX, {
        imagePath,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async mergeTexts(textA: string, textB: string): Promise<string> {
    if (!this.gemini.client) throw new Error('GEMINI_API_KEY is not set');
    const start = Date.now();

    this.logger.debug('Gemini mergeTexts started', CTX, {
      textALength: textA.length,
      textBLength: textB.length,
    });

    try {
      const response = await this.gemini.client!.models.generateContent({
        model: 'gemini-2.5-flash',
        config: { maxOutputTokens: 8192 },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Two OCR engines processed the same receipt and produced different results. Merge them into one accurate text.

Rules:
- Return ONLY the merged raw text, no commentary, no markdown
- Preserve original language, numbers, and layout
- Where texts disagree, pick the most likely correct version
- Do not add or invent information not present in either text
- Output the COMPLETE merged text, do not truncate

Engine A (Paddle):
---
${textA}
---

Engine B (Surya):
---
${textB}
---

Merged text:`,
              },
            ],
          },
        ],
      });

      const candidate = response.candidates?.[0];
      const text =
        candidate?.content?.parts
          ?.filter((p) => p.text)
          .map((p) => p.text)
          .join('\n') ?? '';

      const result = text.trim();

      this.logger.debug('Gemini mergeTexts completed', CTX, {
        mergedTextLength: result.length,
        durationMs: Date.now() - start,
        finishReason: candidate?.finishReason,
      });

      return result;
    } catch (err) {
      this.logger.error('Gemini mergeTexts failed', err instanceof Error ? err : undefined, CTX, {
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
