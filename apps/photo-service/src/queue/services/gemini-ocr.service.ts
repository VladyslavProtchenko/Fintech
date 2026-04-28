import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';
import { AppLogger } from '@fintech/shared-logger';

const CTX = 'GeminiOcrService';

@Injectable()
export class GeminiOcrService {
  private readonly client: GoogleGenAI | null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set — Gemini arbitration disabled', CTX);
      this.client = null;
    } else {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  async extractText(imagePath: string): Promise<string> {
    if (!this.client) throw new Error('GEMINI_API_KEY is not set');
    const start = Date.now();

    this.logger.debug('Gemini extractText started', CTX, { imagePath });

    try {
      const imageData = readFileSync(imagePath);
      const base64 = imageData.toString('base64');

      const response = await this.client.models.generateContent({
        model: 'gemini-3-flash-preview',
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
    if (!this.client) throw new Error('GEMINI_API_KEY is not set');
    const start = Date.now();

    this.logger.debug('Gemini mergeTexts started', CTX, {
      textALength: textA.length,
      textBLength: textB.length,
    });

    try {
      const response = await this.client.models.generateContent({
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
