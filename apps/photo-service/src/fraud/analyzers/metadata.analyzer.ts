import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { KNOWN_EDITING_SOFTWARE } from '../constants';

export interface MetadataResult {
  score: number;
  flags: string[];
  software: string | null;
  hasExif: boolean;
}

@Injectable()
export class MetadataAnalyzer {
  async analyze(buffer: Buffer): Promise<MetadataResult> {
    const flags: string[] = [];
    let score = 0;
    let software: string | null = null;

    const metadata = await sharp(buffer).metadata();
    const hasExif = metadata.exif !== undefined && metadata.exif.length > 0;

    if (hasExif && metadata.exif) {
      software = this.extractSoftware(metadata.exif);
    }

    if (software) {
      const matchedEditor = KNOWN_EDITING_SOFTWARE.find((editor) =>
        software!.toLowerCase().includes(editor.toLowerCase()),
      );
      if (matchedEditor) {
        flags.push(`Editing software detected in EXIF: ${software}`);
        score = 0.8;
      }
    }

    return { score, flags, software, hasExif };
  }

  // Scan raw EXIF buffer for ASCII Software tag value
  private extractSoftware(exif: Buffer): string | null {
    try {
      const str = exif.toString('latin1');
      // EXIF Software tag (0x0131) — ASCII string follows the tag marker
      const match = str.match(/Software\x00+([\x20-\x7E]{2,64})/);
      if (match?.[1]) return match[1].trim().replace(/\x00+$/, '');

      // Fallback: search for known editor names directly in raw EXIF bytes
      const found = KNOWN_EDITING_SOFTWARE.find((editor) =>
        str.toLowerCase().includes(editor.toLowerCase()),
      );
      return found ?? null;
    } catch {
      return null;
    }
  }
}
