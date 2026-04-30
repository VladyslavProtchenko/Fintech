# Fraud Detection — Implementation Plan

Parallel fraud detection for payment screenshots integrated into existing OCR pipeline.
Detects photoshopped/forged screenshots from external banks (PhonePe, GPay, Paytm, etc.).

## Current Pipeline (as-is)

```
POST /upload → Photo(PENDING) → ocr queue
                                    |
                              OcrProcessor
                              ├─ preprocess (sharp: autoOrient + HEIC→JPEG)
                              ├─ writeFile(preprocessed)
                              └─ Promise.all([
                                   paddleQueue.add()    ──→ GPU worker → ocr-results queue
                                   suryaQueue.add()     ──→ GPU worker → ocr-results queue
                                 ])
                                                              |
                                                    OcrResultsProcessor
                                                    ├─ save OcrResult
                                                    ├─ count >= 2? → mergeAndComplete()
                                                    │   ├─ TextMergeService.merge()
                                                    │   ├─ save MergedOcrResult
                                                    │   ├─ Photo.status = COMPLETED
                                                    │   └─ cleanupFile()
                                                    └─ GpuFallbackService (if engine fails)
```

## New Pipeline (to-be)

```
POST /upload → Photo(PENDING) → ocr queue
                                    |
                              OcrProcessor
                              ├─ preprocess (sharp)
                              ├─ writeFile(preprocessed)
                              └─ Promise.all([
                                   paddleQueue.add()        ──→ GPU worker → ocr-results queue
                                   suryaQueue.add()         ──→ GPU worker → ocr-results queue
                                   fraudQueue.add()         ──→ FraudProcessor (NEW)
                                 ])                                  |
                                                          ┌─────────┴──────────┐
                                                          |                    |
                                                  OcrResultsProcessor    FraudProcessor
                                                  ├─ save OcrResult      ├─ metadata check
                                                  ├─ merge               ├─ ELA analysis
                                                  ├─ save Merged         ├─ Gemini Vision
                                                  └─ COMPLETED           └─ save FraudAnalysis
                                                          |                    |
                                                          └─────────┬──────────┘
                                                                    |
                                                        Both done? → check verdict
                                                        ├─ CLEAN → keep COMPLETED
                                                        └─ FORGED → update to FLAGGED
```

Key: fraud analysis runs in parallel with GPU OCR workers — zero added latency.


## Точки изменения в коде

### 1. prisma/schema.prisma — добавить FraudAnalysis + статус FLAGGED

```prisma
enum PhotoStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  DUPLICATE
  FLAGGED      // NEW: fraud detected
}

model Photo {
  // ... existing fields ...
  fraudAnalysis  FraudAnalysis?    // NEW relation
}

model FraudAnalysis {                // NEW model
  id               String   @id @default(uuid())
  photoId          String   @unique
  photo            Photo    @relation(fields: [photoId], references: [id])
  score            Float    // 0.0 (clean) — 1.0 (definitely forged)
  verdict          String   // CLEAN | SUSPICIOUS | LIKELY_FORGED
  flags            String[] // ["edited_metadata", "ela_anomaly", "font_mismatch", ...]
  metadataResult   Json?    // { software: "Photoshop", exifStripped: true, ... }
  elaResult        Json?    // { suspiciousRegions: 3, uniformityScore: 0.4, ... }
  geminiResult     Json?    // { tampered: true, confidence: 0.9, analysis: "..." }
  durationMs       Int      // total analysis time
  createdAt        DateTime @default(now())
}
```

Migration command:
```bash
npx prisma migrate dev --name add_fraud_analysis
```


### 2. src/queue/ocr.processor.ts — добавить dispatch в fraud queue

```diff
  constructor(
    ...
    @InjectQueue('ocr-paddle') private readonly paddleQueue: Queue,
    @InjectQueue('ocr-surya') private readonly suryaQueue: Queue,
+   @InjectQueue('fraud') private readonly fraudQueue: Queue,
  )

  async process(job) {
    ...
    await Promise.all([
      this.paddleQueue.add('ocr-paddle', { photoId, imagePath: originalPath }),
      this.suryaQueue.add('ocr-surya', { photoId, imagePath: originalPath }),
+     this.fraudQueue.add('analyze', { photoId, imagePath: originalPath }),
    ]);
  }
```

Fraud job запускается ОДНОВРЕМЕННО с GPU workers. Получает тот же preprocessed image.


### 3. src/queue/queue.module.ts — зарегистрировать fraud queue + providers

```diff
  BullModule.registerQueue(
    { name: 'ocr', defaultJobOptions: DEFAULT_JOB_OPTIONS },
    { name: 'ocr-paddle', defaultJobOptions: gpuJobOptions },
    { name: 'ocr-surya', defaultJobOptions: gpuJobOptions },
    { name: 'ocr-results', defaultJobOptions: DEFAULT_JOB_OPTIONS },
+   { name: 'fraud', defaultJobOptions: DEFAULT_JOB_OPTIONS },
  ),

  providers: [
    ...
+   FraudProcessor,
+   FraudDetectionService,
+   MetadataAnalyzer,
+   ElaAnalyzer,
+   GeminiFraudAnalyzer,
  ],
```


### 4. Новые файлы

```
src/
  fraud/                              // NEW directory
    fraud.module.ts                   // module (if separate) or add to queue.module
    fraud-detection.service.ts        // orchestrator: runs all analyzers, computes score
    fraud.processor.ts                // BullMQ processor for 'fraud' queue
    analyzers/
      metadata.analyzer.ts            // EXIF check via sharp.metadata()
      ela.analyzer.ts                 // Error Level Analysis via sharp
      gemini-fraud.analyzer.ts        // Gemini Vision forensic analysis
    constants.ts                      // thresholds, weights, known editors list
```


### 5. src/fraud/analyzers/metadata.analyzer.ts

```typescript
// Uses sharp (already in dependencies) — zero new packages
import sharp from 'sharp';

async analyze(imagePath: string): Promise<MetadataResult> {
  const meta = await sharp(imagePath).metadata();

  const flags: string[] = [];

  // Check for editing software
  const software = meta.exif?.toString()?.match(/Software[^\x00]+/)?.[0];
  if (software && KNOWN_EDITORS.some(e => software.includes(e))) {
    flags.push(`edited_with_${software}`);
  }

  // Check if EXIF is completely stripped (suspicious for camera photos)
  if (!meta.exif) {
    flags.push('exif_stripped');
  }

  return { flags, software, hasExif: !!meta.exif, score: flags.length > 0 ? 0.6 : 0 };
}
```


### 6. src/fraud/analyzers/ela.analyzer.ts

```typescript
// ELA algorithm:
// 1. Resave image at quality 95%
// 2. Compute pixel-level difference with original
// 3. Edited regions show different error levels

async analyze(imagePath: string): Promise<ElaResult> {
  const original = sharp(imagePath);
  const { width, height } = await original.metadata();

  // Get raw pixels of original
  const originalRaw = await original.raw().toBuffer();

  // Resave at quality 95% and get raw pixels
  const resaved = await sharp(imagePath)
    .jpeg({ quality: 95 })
    .raw()
    .toBuffer();

  // Compute absolute difference per pixel
  const diff = Buffer.alloc(originalRaw.length);
  for (let i = 0; i < originalRaw.length; i++) {
    diff[i] = Math.abs(originalRaw[i] - resaved[i]);
  }

  // Analyze variance across grid regions
  // High variance = some regions were edited (different compression history)
  const { suspiciousRegions, uniformityScore } = analyzeGrid(diff, width, height);

  const score = suspiciousRegions > 2 ? 0.7 : suspiciousRegions > 0 ? 0.3 : 0;

  return { suspiciousRegions, uniformityScore, score, flags: ... };
}
```


### 7. src/fraud/analyzers/gemini-fraud.analyzer.ts

```typescript
// Reuses existing GoogleGenAI client from GeminiOcrService
// Uses gemini-2.5-flash-lite for cost optimization ($0.0003/image)

async analyze(imagePath: string): Promise<GeminiResult> {
  const imageData = readFileSync(imagePath);
  const base64 = imageData.toString('base64');

  const response = await this.client.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: FRAUD_DETECTION_PROMPT }
      ]
    }]
  });

  // Parse JSON response: { tampered, confidence, flags, analysis }
  return parseGeminiResponse(response);
}
```


### 8. src/fraud/fraud-detection.service.ts — orchestrator

```typescript
async analyze(photoId: string, imagePath: string): Promise<FraudAnalysis> {
  const start = Date.now();

  // Step 1+2: metadata + ELA (free, fast, parallel)
  const [metadata, ela] = await Promise.all([
    this.metadataAnalyzer.analyze(imagePath),
    this.elaAnalyzer.analyze(imagePath),
  ]);

  // Early exit: if metadata + ELA already show clean, skip Gemini (save $)
  const earlyScore = metadata.score * 0.2 + ela.score * 0.3;
  let gemini: GeminiResult | null = null;

  if (earlyScore > 0.1) {
    // Something suspicious — ask Gemini
    gemini = await this.geminiFraudAnalyzer.analyze(imagePath);
  }

  // Compute weighted score
  const score = this.computeScore(metadata, ela, gemini);
  const verdict = score > 0.6 ? 'LIKELY_FORGED'
                : score > 0.3 ? 'SUSPICIOUS'
                : 'CLEAN';

  const flags = [
    ...metadata.flags,
    ...ela.flags,
    ...(gemini?.flags ?? []),
  ];

  return {
    score, verdict, flags,
    metadataResult: metadata,
    elaResult: ela,
    geminiResult: gemini,
    durationMs: Date.now() - start,
  };
}

private computeScore(metadata, ela, gemini): number {
  if (!gemini) {
    // Only metadata + ELA
    return metadata.score * 0.4 + ela.score * 0.6;
  }
  // Full analysis
  return metadata.score * 0.10
       + ela.score * 0.15
       + gemini.confidence * 0.75;  // Gemini is primary signal
}
```


### 9. src/fraud/fraud.processor.ts — BullMQ worker

```typescript
@Processor('fraud')
export class FraudProcessor extends WorkerHost {
  async process(job: Job<{ photoId: string; imagePath: string }>): Promise<void> {
    const { photoId, imagePath } = job.data;

    const result = await this.fraudDetection.analyze(photoId, imagePath);

    // Save to DB
    await this.prisma.fraudAnalysis.create({
      data: {
        photoId,
        score: result.score,
        verdict: result.verdict,
        flags: result.flags,
        metadataResult: result.metadataResult,
        elaResult: result.elaResult,
        geminiResult: result.geminiResult,
        durationMs: result.durationMs,
      },
    });

    // If forged — update photo status
    if (result.verdict === 'LIKELY_FORGED') {
      await this.prisma.photo.updateMany({
        where: { id: photoId, status: { not: 'FAILED' } },
        data: { status: 'FLAGGED' },
      });
    }

    this.logger.log('Fraud analysis completed', CTX, {
      photoId,
      verdict: result.verdict,
      score: result.score.toFixed(2),
      flags: result.flags,
      durationMs: result.durationMs,
    });
  }

  // Fraud analysis failure should NOT block OCR pipeline
  async onFailed(job): Promise<void> {
    this.logger.warn('Fraud analysis failed — OCR continues unaffected', CTX, {
      photoId: job.data.photoId,
      error: job.failedReason,
    });
  }
}
```

Important: `onFailed` only logs a warning — fraud failure does NOT set photo to FAILED.


### 10. src/queue/ocr-results.processor.ts — check fraud after merge

```diff
  private async mergeAndComplete(photoId: string): Promise<void> {
    ...
    // After saving MergedOcrResult and setting COMPLETED:

+   // Check if fraud analysis already completed and flagged this photo
+   const fraud = await this.prisma.fraudAnalysis.findUnique({
+     where: { photoId },
+     select: { verdict: true },
+   });
+   if (fraud?.verdict === 'LIKELY_FORGED') {
+     await this.prisma.photo.updateMany({
+       where: { id: photoId },
+       data: { status: 'FLAGGED' },
+     });
+     this.logger.warn('Photo flagged as forged after OCR merge', CTX, { photoId });
+   }

    await this.cleanupFile(photoId);
  }
```

This handles the race: if fraud finishes AFTER OCR merge, `FraudProcessor` sets FLAGGED directly.
If fraud finishes BEFORE OCR merge, this check catches it.


### 11. src/results/results.controller.ts — include fraud in API response

```diff
  GET /results/status/:photoId
  - include: { mergedResult: true }
+ - include: { mergedResult: true, fraudAnalysis: true }

  Response adds:
  {
    ...
    fraudAnalysis: {
      score: 0.85,
      verdict: "LIKELY_FORGED",
      flags: ["font_mismatch", "overlay_detected"],
    } | null
  }
```


## Timing Diagram

```
Time →  0ms        100ms       2s          3s          4s
        |           |           |           |           |
OCR:    preprocess → dispatch ─────────────────────────→ merge → COMPLETED
        |           |           |           |           |
Fraud:  |           dispatch → metadata+ELA → Gemini ─→ save FraudAnalysis
        |           |           (100ms)      (2s)       |
        |           |           |           |           |
        |           |           |           |   If FORGED → FLAGGED
```

Total time for user: same ~3-4 sec as before. Fraud runs in background.


## File Changes Summary

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | prisma/schema.prisma | Add FraudAnalysis model, FLAGGED status |
| MODIFY | src/queue/ocr.processor.ts | Add fraudQueue injection + dispatch |
| MODIFY | src/queue/queue.module.ts | Register fraud queue + new providers |
| MODIFY | src/queue/ocr-results.processor.ts | Check fraud verdict after merge |
| MODIFY | src/results/results.controller.ts | Include fraudAnalysis in responses |
| MODIFY | src/config/env.validation.ts | Add FRAUD_DETECTION_ENABLED flag (optional) |
| CREATE | src/fraud/fraud.processor.ts | BullMQ processor |
| CREATE | src/fraud/fraud-detection.service.ts | Orchestrator |
| CREATE | src/fraud/analyzers/metadata.analyzer.ts | EXIF check |
| CREATE | src/fraud/analyzers/ela.analyzer.ts | Error Level Analysis |
| CREATE | src/fraud/analyzers/gemini-fraud.analyzer.ts | Gemini Vision |
| CREATE | src/fraud/constants.ts | Thresholds, weights, editor lists |


## New Dependencies

None. Everything uses existing packages:
- `sharp` — already installed (metadata + ELA)
- `@google/genai` — already installed (Gemini)
- `bullmq` — already installed (queue)


## Gemini Fraud Prompt

```
You are an image forensics expert analyzing a payment app screenshot for signs of tampering.

Analyze this image and check for:
1. OVERLAY ARTIFACTS: rectangular patches, sharp edges around text fields, white boxes covering original content, visible bounding boxes around edited areas
2. FONT CONSISTENCY: mismatched fonts, sizes, weights, or rendering styles compared to the rest of the app UI
3. COLOR ACCURACY: colors that don't match the official app theme (PhonePe=green header, GPay=white+blue, Paytm=blue)
4. ALIGNMENT: shifted text, uneven spacing, elements not aligned to the app's layout grid
5. COMPRESSION ARTIFACTS: different JPEG quality in some regions vs others
6. LOGICAL ISSUES: impossible dates, unrealistic amounts, malformed transaction IDs

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "tampered": true or false,
  "confidence": 0.0 to 1.0,
  "flags": ["list of specific issues found"],
  "analysis": "one sentence summary"
}
```


## Cost Optimization

```
Case 1: Clean photo (70% of traffic)
  - Metadata: clean (0ms, $0)
  - ELA: clean (100ms, $0)
  - Early score < 0.1 → skip Gemini
  - Total: $0, 100ms

Case 2: Suspicious photo (20% of traffic)
  - Metadata or ELA flagged something
  - Gemini called → $0.0003
  - Total: $0.0003, ~2.1s

Case 3: Obvious fake (10% of traffic)
  - Metadata: Photoshop detected
  - ELA: high anomaly
  - Gemini called for confirmation → $0.0003
  - Total: $0.0003, ~2.1s

Average cost per image: ~$0.0001 (30% × $0.0003)
10,000 images/day: ~$1/day = ~$30/month
```


## Implementation Order

1. Prisma migration (FraudAnalysis model + FLAGGED status)
2. constants.ts (thresholds, prompt, editor list)
3. metadata.analyzer.ts (simplest, test first)
4. ela.analyzer.ts (sharp-based, no external calls)
5. gemini-fraud.analyzer.ts (reuse existing Gemini client)
6. fraud-detection.service.ts (orchestrator)
7. fraud.processor.ts (BullMQ worker)
8. Wire into queue.module.ts + ocr.processor.ts
9. Update ocr-results.processor.ts (check verdict)
10. Update results.controller.ts (include in API)
11. Unit tests for each analyzer
12. E2E test with real forged image
