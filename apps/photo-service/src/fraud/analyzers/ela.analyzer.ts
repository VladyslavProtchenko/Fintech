import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import { ELA_GRID_SIZE, ELA_STDDEV_THRESHOLD } from '../constants';

export interface ElaResult {
  score: number;
  flags: string[];
  suspiciousBlockCount: number;
  totalBlocks: number;
  uniformityScore: number;
}

@Injectable()
export class ElaAnalyzer {
  async analyze(buffer: Buffer): Promise<ElaResult> {
    // Establish JPEG baseline at 95% quality
    const jpegBuffer = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();

    // Second compression at same quality — authentic regions stabilize,
    // edited regions (different compression history) show higher diff
    const resavedBuffer = await sharp(jpegBuffer).jpeg({ quality: 95 }).toBuffer();

    // Get raw RGB pixels for both versions
    const [orig, resaved] = await Promise.all([
      sharp(jpegBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(resavedBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);

    const { width, height, channels } = orig.info;
    const blockW = Math.floor(width / ELA_GRID_SIZE);
    const blockH = Math.floor(height / ELA_GRID_SIZE);

    if (blockW < 1 || blockH < 1) {
      return { score: 0, flags: [], suspiciousBlockCount: 0, totalBlocks: 0, uniformityScore: 1 };
    }

    const origData = orig.data as Buffer;
    const resavedData = resaved.data as Buffer;

    // Compute mean absolute difference per grid block
    const blockMeans: number[] = [];
    for (let row = 0; row < ELA_GRID_SIZE; row++) {
      for (let col = 0; col < ELA_GRID_SIZE; col++) {
        let sum = 0;
        let count = 0;
        const yStart = row * blockH;
        const yEnd = Math.min((row + 1) * blockH, height);
        const xStart = col * blockW;
        const xEnd = Math.min((col + 1) * blockW, width);

        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const base = (y * width + x) * channels;
            for (let c = 0; c < channels; c++) {
              sum += Math.abs(origData[base + c] - resavedData[base + c]);
            }
            count += channels;
          }
        }
        blockMeans.push(count > 0 ? sum / count : 0);
      }
    }

    const total = blockMeans.length;
    const mean = blockMeans.reduce((a, b) => a + b, 0) / total;
    const variance = blockMeans.reduce((a, b) => a + (b - mean) ** 2, 0) / total;
    const stddev = Math.sqrt(variance);

    const threshold = mean + ELA_STDDEV_THRESHOLD * stddev;
    const suspiciousBlockCount = blockMeans.filter((v) => v > threshold).length;
    const uniformityScore = 1 - suspiciousBlockCount / total;

    // Amplify: stddev threshold is conservative, so multiply raw ratio
    const score = Math.min((suspiciousBlockCount / total) * 2, 1.0);

    const flags: string[] = [];
    if (suspiciousBlockCount > 0) {
      flags.push(
        `ELA: ${suspiciousBlockCount}/${total} image blocks show compression inconsistencies`,
      );
    }

    return { score, flags, suspiciousBlockCount, totalBlocks: total, uniformityScore };
  }
}
