import { Injectable } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { GeminiClientService } from '../../queue/services/gemini-client.service';

const CTX = 'GeminiFraudAnalyzer';

const FRAUD_PROMPT = `You are an image forensics expert analyzing a payment screenshot for signs of tampering or forgery.

Analyze this image and check for:
1. FONT CONSISTENCY: Are all text elements using the same font family and rendering style? Look for mismatched fonts, sizes, or weights.
2. COLOR ACCURACY: Do the colors match the official app UI? (PhonePe = purple/green, GPay = white+blue, Paytm = blue header)
3. ALIGNMENT & SPACING: Are UI elements properly aligned? Look for shifted text, uneven spacing, or misaligned elements.
4. OVERLAY ARTIFACTS: Look for rectangular patches, sharp edges around text, inconsistent backgrounds, or visible edit boundaries.
5. SHADOW & RENDERING: Are shadows, gradients, and rounded corners consistent with native app rendering?
6. LOGICAL CONSISTENCY: Does the transaction data make sense? Valid date/time, proper ID formats, realistic amounts.

Respond ONLY with valid JSON — no markdown, no code blocks, just the raw JSON object:
{"tampered":true,"confidence":0.0,"flags":[],"analysis":""}`;

export interface GeminiFraudResult {
  score: number;
  flags: string[];
  analysis: string;
  confidence: number;
  skipped: boolean;
}

@Injectable()
export class GeminiFraudAnalyzer {
  constructor(
    private readonly gemini: GeminiClientService,
    private readonly logger: AppLogger,
  ) {}

  async analyze(imageBuffer: Buffer): Promise<GeminiFraudResult> {
    if (!this.gemini.client) {
      return { score: 0, flags: [], analysis: 'Gemini unavailable', confidence: 0, skipped: true };
    }

    const start = Date.now();
    try {
      const base64 = imageBuffer.toString('base64');

      const response = await this.gemini.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
              { text: FRAUD_PROMPT },
            ],
          },
        ],
      });

      const rawText =
        response.candidates?.[0]?.content?.parts
          ?.filter((p) => p.text)
          .map((p) => p.text)
          .join('') ?? '';

      this.logger.debug('Gemini fraud response received', CTX, {
        durationMs: Date.now() - start,
        responseLength: rawText.length,
        finishReason: response.candidates?.[0]?.finishReason,
      });

      return this.parseResponse(rawText.trim());
    } catch (err) {
      this.logger.error('Gemini fraud analysis failed', err instanceof Error ? err : undefined, CTX, {
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      // On API error return clean — avoid false positives from transient failures
      return { score: 0, flags: [], analysis: 'Gemini request failed', confidence: 0, skipped: true };
    }
  }

  private parseResponse(raw: string): GeminiFraudResult {
    try {
      // Strip potential markdown code fences Gemini sometimes adds despite instructions
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleaned) as {
        tampered: boolean;
        confidence: number;
        flags: unknown;
        analysis: unknown;
      };

      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      const score = parsed.tampered ? confidence : 0;
      const flags = Array.isArray(parsed.flags)
        ? (parsed.flags as unknown[]).filter((f): f is string => typeof f === 'string')
        : [];

      return {
        score,
        flags,
        analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
        confidence,
        skipped: false,
      };
    } catch (err) {
      this.logger.warn('Gemini fraud response could not be parsed as JSON', CTX, {
        rawPreview: raw.slice(0, 200),
        error: err instanceof Error ? err.message : String(err),
      });
      // Unparseable — treat as clean to avoid false positives
      return { score: 0, flags: [], analysis: raw.slice(0, 200), confidence: 0, skipped: false };
    }
  }
}
