import { readFile } from 'fs/promises';
import { Injectable } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { PrismaService } from '../prisma/prisma.service';
import { MetadataAnalyzer, MetadataResult } from './analyzers/metadata.analyzer';
import { ElaAnalyzer, ElaResult } from './analyzers/ela.analyzer';
import { GeminiFraudAnalyzer, GeminiFraudResult } from './analyzers/gemini-fraud.analyzer';
import { FRAUD_WEIGHTS, FRAUD_THRESHOLDS, EARLY_EXIT_THRESHOLD } from './constants';

const CTX = 'FraudDetectionService';

export type FraudVerdict = 'CLEAN' | 'SUSPICIOUS' | 'LIKELY_FORGED';

const CLEAN_METADATA: MetadataResult = { score: 0, flags: [], software: null, hasExif: false };
const CLEAN_ELA: ElaResult = { score: 0, flags: [], suspiciousBlockCount: 0, totalBlocks: 0, uniformityScore: 1 };
const CLEAN_GEMINI: GeminiFraudResult = { score: 0, flags: [], analysis: 'Skipped', confidence: 0, skipped: true };

@Injectable()
export class FraudDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metadataAnalyzer: MetadataAnalyzer,
    private readonly elaAnalyzer: ElaAnalyzer,
    private readonly geminiAnalyzer: GeminiFraudAnalyzer,
    private readonly logger: AppLogger,
  ) {}

  async analyze(photoId: string, imagePath: string): Promise<void> {
    const start = Date.now();
    this.logger.log('Fraud analysis started', CTX, { photoId });

    let imageBuffer: Buffer;
    try {
      imageBuffer = await readFile(imagePath);
    } catch (err) {
      this.logger.error(
        'Fraud analysis skipped — image file not accessible',
        err instanceof Error ? err : undefined,
        CTX,
        { photoId, imagePath },
      );
      return;
    }

    // Step 1 & 2: Metadata + ELA run in parallel (fast, no external calls)
    const [metadataResult, elaResult] = await Promise.all([
      this.metadataAnalyzer.analyze(imageBuffer).catch((err: unknown) => {
        this.logger.warn('Metadata analyzer failed — using clean fallback', CTX, {
          photoId,
          error: err instanceof Error ? err.message : String(err),
        });
        return CLEAN_METADATA;
      }),
      this.elaAnalyzer.analyze(imageBuffer).catch((err: unknown) => {
        this.logger.warn('ELA analyzer failed — using clean fallback', CTX, {
          photoId,
          error: err instanceof Error ? err.message : String(err),
        });
        return CLEAN_ELA;
      }),
    ]);

    this.logger.debug('Metadata + ELA analysis done', CTX, {
      photoId,
      metadataScore: metadataResult.score,
      metadataSoftware: metadataResult.software,
      elaScore: elaResult.score,
      elaSuspiciousBlocks: elaResult.suspiciousBlockCount,
    });

    const earlyScore =
      metadataResult.score * FRAUD_WEIGHTS.metadata +
      elaResult.score * FRAUD_WEIGHTS.ela;

    // Step 3: Gemini Vision
    // Skip only when both local analyzers returned zero flags AND early score is below threshold.
    // If either analyzer flagged anything — always run Gemini regardless of score,
    // since Gemini carries 75% of the total weight and is the primary detector.
    const hasLocalFlags = metadataResult.flags.length > 0 || elaResult.flags.length > 0;
    let geminiResult: GeminiFraudResult;
    if (!hasLocalFlags && earlyScore < EARLY_EXIT_THRESHOLD) {
      geminiResult = { ...CLEAN_GEMINI, analysis: 'Skipped — no local signals detected' };
      this.logger.debug('Gemini fraud skipped — no local flags and early score below threshold', CTX, {
        photoId,
        earlyScore: earlyScore.toFixed(3),
        threshold: EARLY_EXIT_THRESHOLD,
      });
    } else {
      geminiResult = await this.geminiAnalyzer.analyze(imageBuffer).catch((err: unknown) => {
        this.logger.warn('Gemini fraud analyzer failed — using clean fallback', CTX, {
          photoId,
          error: err instanceof Error ? err.message : String(err),
        });
        return { ...CLEAN_GEMINI, analysis: 'Gemini analyzer error' };
      });
    }

    const score =
      metadataResult.score * FRAUD_WEIGHTS.metadata +
      elaResult.score * FRAUD_WEIGHTS.ela +
      (geminiResult.skipped ? 0 : geminiResult.score * FRAUD_WEIGHTS.gemini);

    const verdict: FraudVerdict =
      score >= FRAUD_THRESHOLDS.likelyForged
        ? 'LIKELY_FORGED'
        : score >= FRAUD_THRESHOLDS.suspicious
        ? 'SUSPICIOUS'
        : 'CLEAN';

    const flags = [
      ...metadataResult.flags,
      ...elaResult.flags,
      ...geminiResult.flags,
    ];

    const durationMs = Date.now() - start;

    // Persist fraud record — separate try/catch from status update
    // so a status update failure doesn't misreport as "fraud analysis not saved"
    try {
      await this.prisma.fraudAnalysis.create({
        data: {
          photoId,
          score,
          verdict,
          flags,
          metadataResult: metadataResult as object,
          elaResult: elaResult as object,
          geminiResult: geminiResult as object,
          durationMs,
        },
      });

      this.logger.log('Fraud analysis saved', CTX, {
        photoId,
        verdict,
        score: score.toFixed(3),
        flagCount: flags.length,
        durationMs,
        geminiSkipped: geminiResult.skipped,
      });
    } catch (err) {
      this.logger.error(
        'Failed to save fraud analysis',
        err instanceof Error ? err : undefined,
        CTX,
        { photoId, error: err instanceof Error ? err.message : String(err) },
      );
      return;
    }

    if (verdict !== 'CLEAN') {
      try {
        await this.prisma.photo.updateMany({
          where: {
            id: photoId,
            status: { notIn: ['FAILED'] },
          },
          data: { status: 'FLAGGED' },
        });

        this.logger.warn('Photo flagged as potentially fraudulent', CTX, {
          photoId,
          verdict,
          score: score.toFixed(3),
          flags,
        });
      } catch (err) {
        this.logger.error(
          'Failed to set photo status to FLAGGED',
          err instanceof Error ? err : undefined,
          CTX,
          { photoId, verdict, error: err instanceof Error ? err.message : String(err) },
        );
      }
    }
  }
}
