import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { MIME_TYPES, type AllowedMimeType } from '../constants';

@Injectable()
export class ImageProcessorService {
  async preprocess(buffer: Buffer, mimeType: AllowedMimeType): Promise<Buffer> {
    const inputBuffer = await this.normalizeToJpeg(buffer, mimeType);

    return sharp(inputBuffer)
      .autoOrient()
      .toBuffer();
  }

  private async normalizeToJpeg(buffer: Buffer, mimeType: AllowedMimeType): Promise<Buffer> {
    if (mimeType !== MIME_TYPES.HEIC && mimeType !== MIME_TYPES.HEIF) {
      return buffer;
    }

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

    return Buffer.from(result as ArrayBuffer);
  }
}
