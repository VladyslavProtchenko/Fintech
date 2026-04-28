import { Injectable } from '@nestjs/common';
import {
  AllowedMimeType,
  HEIC_BRANDS,
  HEIF_BRANDS,
  MIME_TYPES,
} from '../constants';

@Injectable()
export class FileValidatorService {
  detectMimeType(buffer: Buffer): AllowedMimeType | null {
    if (buffer.length < 12) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return MIME_TYPES.JPEG;
    }

    // PNG: 89 50 4E 47
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return MIME_TYPES.PNG;
    }

    // WebP: RIFF????WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return MIME_TYPES.WEBP;
    }

    // TIFF Little-Endian: 49 49 2A 00
    if (
      buffer[0] === 0x49 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x2a &&
      buffer[3] === 0x00
    ) {
      return this.detectTiffVariant(buffer);
    }

    // TIFF Big-Endian: 4D 4D 00 2A
    if (
      buffer[0] === 0x4d &&
      buffer[1] === 0x4d &&
      buffer[2] === 0x00 &&
      buffer[3] === 0x2a
    ) {
      return MIME_TYPES.TIFF;
    }

    // HEIC/HEIF: ftyp box at offset 4
    if (
      buffer.length >= 12 &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    ) {
      return this.detectHeicHeif(buffer);
    }

    return null;
  }

  isAllowedFormat(buffer: Buffer): boolean {
    return this.detectMimeType(buffer) !== null;
  }

  private detectTiffVariant(buffer: Buffer): AllowedMimeType {
    // DNG magic: check for DNG-specific tag (0xC612) in the first IFD
    // Simple heuristic: DNG files typically have "DNG" string in first 1KB
    const header = buffer
      .subarray(0, Math.min(1024, buffer.length))
      .toString('ascii');
    if (header.includes('Adobe DNG') || header.includes('\xc6\x12')) {
      return MIME_TYPES.DNG;
    }
    return MIME_TYPES.TIFF;
  }

  private detectHeicHeif(buffer: Buffer): AllowedMimeType | null {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase().trim();

    if (HEIC_BRANDS.includes(brand)) {
      return MIME_TYPES.HEIC;
    }
    if (HEIF_BRANDS.includes(brand)) {
      return MIME_TYPES.HEIF;
    }

    // Check compatible brands (after offset 16)
    if (buffer.length > 16) {
      const compatBrands = buffer
        .subarray(16, Math.min(64, buffer.length))
        .toString('ascii');
      if (HEIC_BRANDS.some((b) => compatBrands.includes(b)))
        return MIME_TYPES.HEIC;
      if (HEIF_BRANDS.some((b) => compatBrands.includes(b)))
        return MIME_TYPES.HEIF;
    }

    // Unknown ftyp brand (e.g. MP4, MOV) — reject
    return null;
  }
}
