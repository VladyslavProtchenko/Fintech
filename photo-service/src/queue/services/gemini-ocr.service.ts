import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';

@Injectable()
export class GeminiOcrService {
  private readonly logger = new Logger(GeminiOcrService.name);
  private readonly client: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async extractText(imagePath: string): Promise<string> {
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

    return text.trim();
  }

  async mergeTexts(textA: string, textB: string): Promise<string> {
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
    this.logger.debug(`Merge finishReason: ${candidate?.finishReason}`);

    const text =
      candidate?.content?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join('\n') ?? '';

    return text.trim();
  }
}
