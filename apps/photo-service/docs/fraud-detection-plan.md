# Fraud Detection for Payment Screenshots

Research and implementation plan for detecting tampered/forged payment screenshots (UPI, PhonePe, GPay, Paytm, etc.).

## Problem

Fraudsters edit payment screenshots to fake transactions:
- Change amount, recipient name, UTR, Transaction ID
- Use screenshot-editing apps (PicsArt, Snapseed, built-in editors)
- Use "demo mode" apps that simulate payment UI
- Modify old legitimate screenshots (change date, amount, payee)

**Key insight from industry**: "Never accept customer-provided proof as final confirmation. Your merchant systems hold the only valid record." — Cashfree, Razorpay

## Research Summary

### 1. Error Level Analysis (ELA)

**Source**: IEEE, ResearchGate, Wikipedia — standard forensic technique since ~2007.

**How it works**:
1. Re-save JPEG at known quality (e.g., 95%)
2. Compute pixel-level difference: `E = |Original - Resaved|`
3. Unmodified regions have uniform error levels (same compression history)
4. Edited regions show different error levels (extra compression cycle)
5. JPEG works in 8x8 pixel blocks — tampered blocks have different compression artifacts

**Strengths**:
- Zero external dependencies (implementable with `sharp`)
- Fast (~100ms per image)
- Effective for JPEG copy-paste edits
- Detects regions with different compression histories

**Weaknesses**:
- Less effective on PNG (lossless — no compression artifacts)
- Can be fooled by re-saving entire image multiple times
- High false positive rate on images with text overlays (which payment apps naturally have)
- Screenshots from phones are typically PNG — need conversion consideration

**Verdict**: Useful as one signal, but NOT reliable alone for payment screenshots.

### 2. Metadata (EXIF) Analysis

**How it works**:
- Check `Software` field — Photoshop, PicsArt, Snapseed = red flag
- Check if EXIF is completely stripped (suspicious — real photos always have EXIF)
- Check `DateTime` vs transaction date
- Check device model consistency

**Strengths**:
- Instant (metadata parsing is <1ms)
- Zero cost
- Clear signal when editing software is detected

**Weaknesses**:
- Easily bypassed — EXIF can be stripped or forged
- Screenshots inherently have minimal EXIF (no GPS, no camera model)
- Many messaging apps strip EXIF on forward (WhatsApp, Telegram)

**Verdict**: Low-hanging fruit, worth checking but unreliable as primary detection.

### 3. AI Vision Analysis (Gemini)

**How it works**:
- Send image to Gemini with specialized prompt
- Gemini analyzes: font consistency, spacing, alignment, color shades, shadows, UI element accuracy
- Can compare against known UI templates (PhonePe purple, GPay blue, etc.)
- Gemini 3 Flash has "active investigation" mode — can zoom, crop, annotate

**Strengths**:
- Most powerful detection for visual inconsistencies
- Can detect font mismatches, wrong colors, misaligned elements
- Understands context (knows what PhonePe UI should look like)
- Can analyze text content for logical inconsistencies

**Weaknesses**:
- Cost: ~$0.001-0.003 per image
- Latency: 1-3 seconds
- Not deterministic — may give different results on same image
- Can be fooled by high-quality forgeries

**Verdict**: Best single-method detector. Should be primary analysis tool.

### 4. Structural / Content Validation

**How it works**:
- After OCR extracts text, validate the data logically:
  - UTR number: must be exactly 12 digits for UPI
  - Transaction ID: check format matches app pattern (PhonePe: T + 22 digits)
  - Date/time: check if future date, or unrealistic time
  - Amount: check if round number (common in fakes) vs realistic amount
  - Bank name + account format: cross-reference known patterns

**Strengths**:
- Zero cost (runs on OCR output we already have)
- Very effective — fraudsters often get formats wrong
- Deterministic — clear pass/fail rules

**Weaknesses**:
- Only catches format errors, not sophisticated fakes with valid-looking data
- Requires maintaining format rules per app

**Verdict**: Excellent complement. Should always run.

### 5. UTR/Transaction Verification via API

**How it works**:
- Use third-party APIs (Attestr, SurePass, Inspay) to verify UTR against NPCI database
- Confirm: transaction exists, amount matches, recipient matches

**Strengths**:
- **Definitive proof** — either transaction exists or it doesn't
- Cannot be fooled by any image manipulation

**Weaknesses**:
- Requires paid API subscription
- Not all UTRs can be verified (some banks don't expose this)
- Latency: 2-5 seconds per verification
- Privacy/compliance considerations

**Verdict**: Ultimate verification, but requires business relationship with API provider. Phase 2.


## Proposed Architecture

### Pipeline (runs AFTER OCR, on same image)

```
POST /upload
  -> OCR pipeline (existing) -> mergedText
  -> Fraud pipeline (new, parallel with OCR):

      Step 1: Metadata Check          (~1ms, free)
      Step 2: ELA Analysis            (~100ms, free)
      Step 3: Structural Validation   (~1ms, free, needs OCR result)
      Step 4: Gemini Vision Analysis  (~2s, ~$0.002)

      -> FraudAnalysis result:
         {
           score: 0.0 - 1.0,       // 0 = clean, 1 = definitely fake
           verdict: "CLEAN" | "SUSPICIOUS" | "LIKELY_FORGED",
           flags: string[],         // specific issues found
           details: {
             metadata: { ... },
             ela: { suspiciousRegions: number, uniformityScore: number },
             structural: { validUtr: boolean, validTxnId: boolean, ... },
             gemini: { analysis: string, confidence: number }
           }
         }
```

### Scoring Logic

```
score = weighted sum of:
  - Metadata flags:        weight 0.10  (easily spoofed)
  - ELA anomaly score:     weight 0.15  (useful but noisy for screenshots)
  - Structural validation: weight 0.25  (strong signal)
  - Gemini analysis:       weight 0.50  (strongest signal)

Thresholds:
  score < 0.3   -> CLEAN
  score 0.3-0.6 -> SUSPICIOUS  (flag for manual review)
  score > 0.6   -> LIKELY_FORGED (reject or require additional verification)
```

### Behavior on Detection

**If fraud detected (SUSPICIOUS or LIKELY_FORGED)**:
- Photo status = `FLAGGED` (new status, between COMPLETED and FAILED)
- OCR result is still saved (we already did the work)
- Response includes fraud analysis
- **Do NOT process further** — flag for manual review

**If clean**:
- Normal COMPLETED flow, fraud score included in response


## Database Changes

```prisma
model FraudAnalysis {
  id             String   @id @default(cuid())
  photoId        String   @unique
  photo          Photo    @relation(fields: [photoId], references: [id])
  score          Float
  verdict        String   // CLEAN | SUSPICIOUS | LIKELY_FORGED
  flags          String[] // array of flag strings
  metadataResult Json?
  elaResult      Json?
  structuralResult Json?
  geminiResult   Json?
  createdAt      DateTime @default(now())
}

// Photo model: add FLAGGED to status enum
enum PhotoStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  FLAGGED    // new
}
```


## Implementation Plan

### Phase 1 — Core Detection (MVP)

1. **Add `FraudAnalysis` model to Prisma schema**
   - New table, relation to Photo
   - Add `FLAGGED` status to Photo

2. **`MetadataAnalyzer` service**
   - Use `sharp.metadata()` to extract EXIF
   - Check `Software` field against known editors list
   - Check if EXIF is stripped vs expected
   - Return: flags[], suspicionScore (0-1)

3. **`ElaAnalyzer` service**
   - Resave image at quality 95% with `sharp`
   - Compute pixel difference using `sharp.raw()` buffers
   - Calculate per-region variance (divide image into grid)
   - Regions with variance > 2 stddev from mean = suspicious
   - Return: suspiciousRegionCount, uniformityScore, flags[]

4. **`StructuralValidator` service**
   - Takes OCR text output
   - Validates UTR format (12 digits for UPI)
   - Validates Transaction ID format per app (PhonePe: T + 22 digits)
   - Checks date validity
   - Return: validationResults, flags[]

5. **`GeminiFraudAnalyzer` service**
   - Sends image to Gemini with forensic analysis prompt
   - Prompt asks to check: font consistency, color accuracy, alignment, shadows, overlay artifacts, logical consistency
   - Return: analysis text, confidence score, flags[]

6. **`FraudDetectionService` (orchestrator)**
   - Runs all 4 analyzers
   - Computes weighted score
   - Determines verdict
   - Saves FraudAnalysis to DB
   - Updates Photo status if FLAGGED

7. **BullMQ integration**
   - New queue: `fraud-analysis`
   - Triggered from OcrProcessor after preprocessing (parallel with GPU dispatch)
   - Steps 1-2 run immediately (no OCR needed)
   - Steps 3-4 wait for OCR result, then run
   - Writes FraudAnalysis when all steps complete

8. **API changes**
   - `GET /results/status/:photoId` — include `fraudAnalysis` in response
   - New status `FLAGGED` in responses

### Phase 2 — Enhanced (Future)

- UTR verification via external API (Attestr/SurePass)
- App-specific UI template matching (PhonePe purple #5f259f, GPay blue, etc.)
- Historical pattern analysis (same UTR used multiple times across uploads)
- ML model trained on labeled fake vs real screenshots (CASIA dataset + custom)


## File Structure

```
src/
  fraud/
    fraud.module.ts
    fraud-detection.service.ts      // orchestrator
    fraud-analysis.processor.ts     // BullMQ processor
    analyzers/
      metadata.analyzer.ts
      ela.analyzer.ts
      structural.validator.ts
      gemini-fraud.analyzer.ts
    constants.ts                    // thresholds, weights, editor lists
```


## Gemini Prompt (Draft)

```
You are an image forensics expert analyzing a payment screenshot for signs of tampering or forgery.

Analyze this image and check for:
1. FONT CONSISTENCY: Are all text elements using the same font family and rendering style expected for this app? Look for mismatched fonts, sizes, or weights.
2. COLOR ACCURACY: Do the colors match the official app UI? (PhonePe = green header + white body, GPay = white + blue accent, Paytm = blue header)
3. ALIGNMENT & SPACING: Are UI elements properly aligned? Look for shifted text, uneven spacing, or elements that don't snap to the app's grid.
4. OVERLAY ARTIFACTS: Look for rectangular patches, sharp edges around text, inconsistent backgrounds, or visible bounding boxes around edited fields.
5. SHADOW & RENDERING: Are shadows, gradients, and rounded corners consistent with native app rendering?
6. LOGICAL CONSISTENCY: Does the transaction data make sense? (valid date, reasonable amount, proper ID formats)

Respond with JSON:
{
  "tampered": true/false,
  "confidence": 0.0-1.0,
  "flags": ["list of specific issues found"],
  "analysis": "brief explanation"
}
```


## Cost Estimate

Per image:
- Metadata + ELA + Structural: $0 (local computation)
- Gemini Vision: ~$0.002

At scale (10,000 images/day):
- Gemini: ~$20/day = ~$600/month
- Total: ~$600/month (same Gemini 2.5 Flash used for OCR merge)

Optimization: skip Gemini if metadata + ELA + structural all return clean (score < 0.1).
Expected Gemini skip rate: ~70% of legitimate images. Reduces cost to ~$180/month.


## References

- [Fake Payment Screenshot Scams 2026 — Cashfree](https://www.cashfree.com/blog/fake-payment-screenshot-scams/)
- [Fake Payment Screenshot Scam 2026 — Razorpay](https://razorpay.com/learn/fake-payment-screenshot-scam/)
- [Fake PhonePe Screenshot: 7 Ways to Catch It — ScamDekho](https://scamdekho.in/blog/fake-phonepe-screenshot-7-ways-to-catch-it-before-you-lose-money)
- [Image Forgery Detection Using ELA + Metadata — SpringerLink](https://link.springer.com/chapter/10.1007/978-981-16-8987-1_62)
- [ELA + CNN Integration for Forgery Detection — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11323046/)
- [Error Level Analysis — Wikipedia](https://en.wikipedia.org/wiki/Error_level_analysis)
- [Building Deepfake Detection with Gemini API — Medium](https://medium.com/@aka.0x4C3DD/building-a-multi-modal-deepfake-detection-system-using-googles-gemini-api-490dd9f22ada)
- [UPI Verification API — Attestr](https://docs.attestr.com/attestr-docs/upi-verification-api)
- [UTR Number for UPI — Bajaj Finserv](https://www.bajajfinserv.in/utr-number-for-upi-transaction)
- [Holistic Image Forensics: ELA + CNN + MLP — Research Square](https://www.researchsquare.com/article/rs-4667372/v1)
