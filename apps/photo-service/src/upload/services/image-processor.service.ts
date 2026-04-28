import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { AppLogger } from '@fintech/shared-logger';
import { MIME_TYPES, type AllowedMimeType } from '../constants';

const CTX = 'ImageProcessorService';

@Injectable()
export class ImageProcessorService {
  constructor(private readonly logger: AppLogger) {}

  async preprocess(buffer: Buffer, mimeType: AllowedMimeType): Promise<Buffer> {
    const start = Date.now();
    const inputBuffer = await this.normalizeToJpeg(buffer, mimeType);
    const result = await sharp(inputBuffer).autoOrient().toBuffer();

    this.logger.debug('Image preprocessed', CTX, {
      mimeType,
      inputSize: buffer.length,
      outputSize: result.length,
      durationMs: Date.now() - start,
    });

    return result;
  }

  private async normalizeToJpeg(
    buffer: Buffer,
    mimeType: AllowedMimeType,
  ): Promise<Buffer> {
    if (mimeType !== MIME_TYPES.HEIC && mimeType !== MIME_TYPES.HEIF) {
      return buffer;
    }

    this.logger.debug('Converting HEIC/HEIF to JPEG', CTX, {
      mimeType,
      inputSize: buffer.length,
    });

    try {
      // heic-convert is CommonJS
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const convert = require('heic-convert') as (opts: {
        buffer: ArrayBuffer;
        format: 'JPEG';
        quality: number;
      }) => Promise<ArrayBuffer>;

      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;

      const result = await convert({
        buffer: arrayBuffer,
        format: 'JPEG',
        quality: 0.9,
      });

      const converted = Buffer.from(result);

      this.logger.debug('HEIC/HEIF conversion completed', CTX, {
        mimeType,
        inputSize: buffer.length,
        outputSize: converted.length,
      });

      return converted;
    } catch (err) {
      this.logger.error('HEIC/HEIF conversion failed', err instanceof Error ? err : undefined, CTX, {
        mimeType,
        inputSize: buffer.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
