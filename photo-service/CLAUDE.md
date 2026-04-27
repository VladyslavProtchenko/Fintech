# photo-service

Self-hosted OCR receipt recognition service. NestJS + BullMQ + PostgreSQL + Redis.

## Stack

- **Runtime**: Node.js, TypeScript strict
- **Framework**: NestJS
- **Queue**: BullMQ (Redis)
- **DB**: PostgreSQL via Prisma (client output → `generated/prisma`)
- **Image processing**: sharp, heic-convert
- **AI merge**: Google Gemini (`@google/genai`)

## Architecture

```
POST /upload → UploadController
  → validate MIME (magic bytes)
  → save to DB (PENDING)
  → write file to uploads/originals/
  → enqueue → ocr queue

ocr queue (OcrProcessor)
  → preprocess: autoOrient + HEIC→JPEG (sharp)
  → fan-out: enqueue ocr-paddle + ocr-surya in parallel

ocr-paddle / ocr-surya
  → external GPU workers (not in this repo)
  → push result to ocr-results queue

ocr-results queue (OcrResultsProcessor)
  → save OcrResult per source
  → when both results received (count >= 2):
    → TextMergeService.merge()
      → Jaccard similarity >= 0.9 → direct (pick longer text)
      → similarity < 0.9 → Gemini arbitration
    → save MergedOcrResult, set photo status = COMPLETED
    → delete original file

GpuFallbackService (QueueEvents listeners)
  → if one GPU engine fails permanently (all retries exhausted):
    → other engine result available → single-source merge (confidence=0.5)
    → both failed → status = FAILED
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload` | Upload image (multipart `file`), returns `{id, jobId, status, sha256}` |
| GET | `/results` | All completed results |
| GET | `/results/:id` | Single MergedOcrResult by id |
| GET | `/results/status/:photoId` | Photo processing status + result if done |
| GET | `/health` | Health check |

## DB Models

- **Photo**: id, originalName, mimeType, size, sha256 (unique), originalPath, status (PENDING→PROCESSING→COMPLETED/FAILED), jobId
- **OcrResult**: photoId, source (paddle/surya), rawText, data (JSON)
- **MergedOcrResult**: photoId (unique), mergedText, confidenceScore, mergeStrategy (direct/gemini-arbitrated/single-source), selectedSource

## Queues

| Queue | Timeout | Workers |
|-------|---------|---------|
| `ocr` | default | OcrProcessor (in-app) |
| `ocr-paddle` | 2min | External GPU worker |
| `ocr-surya` | 2min | External GPU worker |
| `ocr-results` | default | OcrResultsProcessor (in-app) |

All queues: 3 attempts, exponential backoff (1s base).

## Env Variables

```
NODE_ENV           development|production|test
PORT               3000
DATABASE_URL       required
REDIS_HOST         localhost
REDIS_PORT         6379
UPLOAD_DIR         ./uploads
GEMINI_API_KEY     optional (required for Gemini merge)
```

## Supported MIME Types

`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `image/tiff`, `image/x-adobe-dng`. Max 10MB.

## Key Notes

- Dedup by SHA256 exists in schema but is commented out in upload controller (TODO)
- HEIC/HEIF converted to JPEG before dispatching to GPU workers
- Race condition on merge (both engines finish simultaneously) handled via `P2002` unique constraint catch
- Original file deleted after successful merge
- Prisma client is custom-generated at `generated/prisma` (not default location)
