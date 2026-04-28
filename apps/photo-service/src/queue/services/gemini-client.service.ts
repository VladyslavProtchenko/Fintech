import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AppLogger } from '@fintech/shared-logger';

const CTX = 'GeminiClientService';

/**
 * Shared Gemini API client provider.
 * Both GeminiOcrService and GeminiFraudAnalyzer inject this instead of
 * each creating their own GoogleGenAI instance with the same API key.
 */
@Injectable()
export class GeminiClientService {
  readonly client: GoogleGenAI | null;

  constructor(config: ConfigService, logger: AppLogger) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      logger.log('Gemini client initialized', CTX);
    } else {
      this.client = null;
      logger.warn('GEMINI_API_KEY not set — all Gemini features disabled', CTX);
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }
}
