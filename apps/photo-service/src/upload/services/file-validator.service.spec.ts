import { FileValidatorService } from './file-validator.service';
import { MIME_TYPES } from '../constants';

describe('FileValidatorService', () => {
  const service = new FileValidatorService();

  function buf(bytes: number[], size = 16): Buffer {
    const b = Buffer.alloc(size, 0);
    bytes.forEach((v, i) => { b[i] = v; });
    return b;
  }

  it('detects JPEG', () => {
    expect(service.detectMimeType(buf([0xff, 0xd8, 0xff]))).toBe(MIME_TYPES.JPEG);
  });

  it('detects PNG', () => {
    expect(service.detectMimeType(buf([0x89, 0x50, 0x4e, 0x47]))).toBe(MIME_TYPES.PNG);
  });

  it('detects WebP', () => {
    const b = Buffer.alloc(16, 0);
    b.write('RIFF', 0, 'ascii');
    b.write('WEBP', 8, 'ascii');
    expect(service.detectMimeType(b)).toBe(MIME_TYPES.WEBP);
  });

  it('detects TIFF big-endian', () => {
    expect(service.detectMimeType(buf([0x4d, 0x4d, 0x00, 0x2a]))).toBe(MIME_TYPES.TIFF);
  });

  it('detects HEIC', () => {
    const b = Buffer.alloc(16, 0);
    b.write('ftyp', 4, 'ascii');
    b.write('heic', 8, 'ascii');
    expect(service.detectMimeType(b)).toBe(MIME_TYPES.HEIC);
  });

  it('detects HEIF', () => {
    const b = Buffer.alloc(16, 0);
    b.write('ftyp', 4, 'ascii');
    b.write('avif', 8, 'ascii');
    expect(service.detectMimeType(b)).toBe(MIME_TYPES.HEIF);
  });

  it('returns null for random bytes', () => {
    expect(service.detectMimeType(buf([0x00, 0x01, 0x02]))).toBeNull();
  });

  it('returns null for buffer shorter than 12 bytes', () => {
    expect(service.detectMimeType(Buffer.alloc(8))).toBeNull();
  });

  it('rejects unknown ftyp brand (e.g. MP4)', () => {
    const b = Buffer.alloc(16, 0);
    b.write('ftyp', 4, 'ascii');
    b.write('isom', 8, 'ascii'); // MP4
    expect(service.detectMimeType(b)).toBeNull();
  });

  it('isAllowedFormat returns true for valid buffer', () => {
    expect(service.isAllowedFormat(buf([0xff, 0xd8, 0xff]))).toBe(true);
  });

  it('isAllowedFormat returns false for invalid buffer', () => {
    expect(service.isAllowedFormat(buf([0x00, 0x00, 0x00]))).toBe(false);
  });
});
