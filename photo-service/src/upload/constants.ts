export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const MIME_TYPES = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  TIFF: 'image/tiff',
  DNG: 'image/x-adobe-dng',
} as const;

export type AllowedMimeType = (typeof MIME_TYPES)[keyof typeof MIME_TYPES];

export const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
export const HEIF_BRANDS = ['mif1', 'msf1', 'avif', 'avis'];
