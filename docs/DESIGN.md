# OTP Service — Design Document

## Overview

Microservice for sending and verifying OTP codes via SMS, WhatsApp, and Voice. Primary market — India, with architecture ready for global expansion. Built following banking-grade patterns: multi-provider routing, multi-channel failover, dynamic scoring, delivery monitoring, and full audit trail.

All providers are plug-and-play. Adding a new provider = one adapter file + one line in routing config.

---

## Architecture

```
POST /otp/send  ->  OtpController
  -> validate phone (libphonenumber-js)
  -> detect country + carrier
  -> generate OTP (6 digits, crypto.randomInt)
  -> store in Redis (TTL = 5 min)
  -> rate limit check (Redis: per phone + per IP)
  -> ChannelOrchestrator.send(phone, otp)
    -> Tier 1: SMS
      -> ProviderRouter selects best provider by dynamic score
      -> try provider #1 -> await DLR (10s timeout)
      -> if failed -> try provider #2 -> await DLR
      -> if all SMS providers failed -> Tier 2
    -> Tier 2: WhatsApp Business API
      -> send via WhatsApp template -> await delivery (15s timeout)
      -> if failed -> Tier 3
    -> Tier 3: Voice Call
      -> TTS reads OTP to user
      -> if failed -> return error + alert ops
    -> log result + failover chain to DB (audit trail)
  -> return { requestId, channel, expiresIn }

POST /otp/verify  ->  OtpController
  -> get OTP from Redis by phone hash
  -> compare (constant-time via crypto.timingSafeEqual)
  -> max 3 attempts, then invalidate
  -> log verification attempt (audit trail)
  -> return { verified: boolean }

GET /health  ->  HealthController
```

---

## Multi-Channel Failover

```
Request
  |
  v
Tier 1: Best-scored SMS provider for this country/carrier
  | <- await DLR 10s
  | <- not delivered?
  v
Tier 2: Next SMS provider (by score)
  | <- await DLR 10s
  | <- not delivered?
  v
Tier 3: WhatsApp Business API
  | <- await delivery 15s
  | <- not delivered?
  v
Tier 4: Voice Call (TTS reads OTP)
  | <- call completed?
  | <- failed?
  v
Error + ops alert
```

| Channel | Delivery Rate (India) | Cost | Latency |
|---------|----------------------|------|---------|
| SMS | 85-95% | Cheapest | 2-10s |
| WhatsApp | 95-99% | ~₹0.30-0.50 | 1-3s |
| Voice | 98%+ | Most expensive | 15-30s |

---

## Provider Adapter Interface

Every provider implements this interface. Adding a new provider = one file.

```typescript
interface SendResult {
  success: boolean;
  providerRef?: string;    // provider's request_id / message_sid
  error?: string;
  latencyMs: number;
}

interface SmsProviderAdapter {
  readonly name: string;             // 'fast2sms' | 'msg91' | 'twilio'
  readonly channel: Channel;         // SMS | WHATSAPP | VOICE
  readonly supportedCountries: string[];  // ['IN'] or ['*'] for global

  send(phone: string, message: string): Promise<SendResult>;
  supportsDlr(): boolean;
}
```

### Available Adapters

| Adapter | Channel | Countries | DLR | Status |
|---------|---------|-----------|-----|--------|
| `fast2sms.adapter.ts` | SMS | IN | No (quick route) | Ready (API key available) |
| `msg91-sms.adapter.ts` | SMS | IN | Yes | Stub (needs API key) |
| `msg91-whatsapp.adapter.ts` | WhatsApp | IN | Yes | Stub (needs API key) |
| `msg91-voice.adapter.ts` | Voice | IN | Yes | Stub (needs API key) |
| `twilio-sms.adapter.ts` | SMS | * | Yes | Stub (needs API key) |
| `twilio-whatsapp.adapter.ts` | WhatsApp | * | Yes | Stub (needs API key) |
| `twilio-voice.adapter.ts` | Voice | * | Yes | Stub (needs API key) |

Stub = adapter code ready, throws "provider not configured" until env var is set.

---

## Dynamic Routing

Provider selection is score-based, not hardcoded order.

### Routing Config (per country)

```typescript
// Which channels are available for each country, in priority order
const CHANNEL_PRIORITY: Record<string, Channel[]> = {
  IN: [Channel.SMS, Channel.WHATSAPP, Channel.VOICE],
  DEFAULT: [Channel.SMS, Channel.VOICE],
};

// Which provider adapters are registered for each channel+country
// Order here is only the initial order — dynamic scoring reorders at runtime
const PROVIDER_REGISTRY: ProviderConfig[] = [
  { name: 'fast2sms',  channel: 'SMS',      countries: ['IN'] },
  { name: 'msg91',     channel: 'SMS',      countries: ['IN'] },
  { name: 'msg91',     channel: 'WHATSAPP', countries: ['IN'] },
  { name: 'msg91',     channel: 'VOICE',    countries: ['IN'] },
  { name: 'twilio',    channel: 'SMS',      countries: ['*']  },
  { name: 'twilio',    channel: 'WHATSAPP', countries: ['*']  },
  { name: 'twilio',    channel: 'VOICE',    countries: ['*']  },
];
```

### Scoring Algorithm

Each provider has a score per country+channel, recalculated every 5 minutes from sliding 1-hour window:

```
score = successRate * 0.6 + speedScore * 0.2 + costScore * 0.2

successRate = successCount / (successCount + failureCount)
speedScore  = 1 - (avgLatencyMs / MAX_ACCEPTABLE_LATENCY)  // clamped 0-1
costScore   = 1 - (avgCost / MAX_ACCEPTABLE_COST)          // clamped 0-1
```

Provider with highest score goes first. New providers start with score = 0.5 (neutral).

### Provider Selection Flow

```
ProviderRouter.selectProviders(country, channel):
  1. Get all registered providers for this country + channel
  2. Filter: only providers where env key is configured (skip stubs)
  3. Filter: exclude circuit-broken providers
  4. Sort by dynamic score (highest first)
  5. Return ordered list
```

---

## Circuit Breaker

Per-provider, per-country, stored in Redis (shared across instances):

```
State: CLOSED (normal)
  -> 5 consecutive failures -> OPEN

State: OPEN (broken)
  -> skip provider, return immediately
  -> after 60s cooldown -> HALF_OPEN

State: HALF_OPEN (testing)
  -> allow 1 request
  -> success -> CLOSED
  -> failure -> OPEN (reset cooldown)
```

Redis keys:
```
circuit:{provider}:{country} -> { state, failureCount, openedAt }  TTL=3600s
```

---

## Delivery Report Monitoring (DLR)

```
OTP Service -> Provider API -> HTTP 200 (accepted)
                    |
                    v
             Provider -> Carrier -> User's phone
                    |
                    v
             Carrier -> Provider (delivery report)
                    |
                    v
             Provider -> Webhook -> OTP Service (DLR callback)
```

For providers without DLR (Fast2SMS quick route): treat HTTP 200 + `"return": true` as SENT.

DLR webhook endpoints:
```
POST /webhooks/dlr/:provider   // generic, routes by provider name
```

---

## Fast2SMS Integration

### Quick SMS (No DLT Required)

```
POST https://www.fast2sms.com/dev/bulkV2
Headers:
  authorization: {FAST2SMS_API_KEY}
  Content-Type: application/json

Body:
{
  "route": "q",
  "message": "Your OTP is 123456. Valid for 5 minutes.",
  "language": "english",
  "flash": 0,
  "numbers": "9523924983"
}

Response (success):
{ "return": true, "request_id": "SUoqUUX4PXFrO3e", "message": ["SMS sent successfully."] }

Response (error):
{ "return": false, "message": "..." }
```

### DLT Route (Production)

```
POST https://www.fast2sms.com/dev/bulkV2
Body:
{
  "route": "dlt",
  "sender_id": "FINTEK",
  "message": "158793",
  "variables_values": "123456",
  "flash": 0,
  "numbers": "9523924983"
}
```

---

## OTP Security

| Aspect | Implementation |
|--------|---------------|
| Generation | `crypto.randomInt(100000, 999999)` — cryptographically secure |
| Storage | Redis with TTL (5 min default, configurable) |
| Verification | Constant-time comparison (`crypto.timingSafeEqual`) |
| Max attempts | 3 per OTP, then invalidate |
| Rate limiting | Per phone: max 5 per 10 min, max 10 per hour. Per IP: max 20 per 10 min |
| Cooldown | 30s between sends to same number |
| Phone format | Always E.164, validated via libphonenumber |
| Logging | NEVER log OTP values — only request IDs, masked phone, channel, provider |
| Provider keys | Environment variables, never in code or logs |

### Abuse Prevention

| Attack | Mitigation |
|--------|-----------|
| Brute force OTP | 3 attempts max, then invalidate |
| SMS pumping | Rate limit per phone + per IP |
| Enumeration | Always same response shape |
| Replay | OTP is single-use, deleted after verification |

---

## Data Model

### PostgreSQL (Prisma)

```prisma
enum OtpStatus {
  PENDING SENT DELIVERED FAILED TIMEOUT VERIFIED EXPIRED
}

enum Channel {
  SMS WHATSAPP VOICE
}

model OtpAuditLog {
  id            String    @id @default(uuid())
  phone         String    // masked: +91****4983
  phoneHash     String    // SHA256(E.164)
  country       String
  carrier       String?
  channel       Channel
  provider      String
  providerRef   String?
  status        OtpStatus @default(PENDING)
  failoverChain Json?     // [{ provider, channel, status, ms }]
  attempts      Int       @default(0)
  duration      Int?      // ms
  cost          Float?
  templateId    String?
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime  @default(now())
  verifiedAt    DateTime?
  expiredAt     DateTime?

  @@index([phoneHash, createdAt])
  @@index([provider, status, createdAt])
  @@index([channel, status, createdAt])
  @@index([ipAddress, createdAt])
}

model ProviderHealth {
  id              String    @id @default(uuid())
  provider        String
  country         String
  channel         Channel
  successCount    Int       @default(0)
  failureCount    Int       @default(0)
  totalLatencyMs  Int       @default(0)
  circuitState    String    @default("closed")
  circuitOpenedAt DateTime?
  windowStart     DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([provider, country, channel])
  @@index([circuitState])
}

model DlrCallback {
  id          String   @id @default(uuid())
  provider    String
  providerRef String
  rawPayload  Json
  status      String
  receivedAt  DateTime @default(now())

  @@index([providerRef])
}
```

### Redis

```
otp:{phoneHash}            -> { code, attempts, channel, createdAt }  TTL=300s
otp:rate:{phoneHash}       -> counter                                  TTL=600s
otp:hourly:{phoneHash}     -> counter                                  TTL=3600s
otp:cooldown:{phoneHash}   -> 1                                        TTL=30s
otp:ip:{ip}                -> counter                                  TTL=600s
circuit:{provider}:{country} -> { state, failures, openedAt }         TTL=3600s
dlr:pending:{providerRef}  -> { phone, provider, channel, sentAt }    TTL=60s
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/otp/send` | API Key / JWT | Send OTP |
| POST | `/otp/verify` | API Key / JWT | Verify OTP |
| GET | `/otp/status/:requestId` | API Key / JWT | Delivery status |
| POST | `/webhooks/dlr/:provider` | Provider signature | DLR callback |
| GET | `/providers/health` | Internal | Provider health + scores |
| GET | `/health` | Public | Service health check |

---

## Project Structure

```
otp-service/
  src/
    main.ts
    app.module.ts
    config/
      env.validation.ts
      routing.config.ts              -- channel priority + provider registry per country
    prisma/
      prisma.module.ts
      prisma.service.ts
    redis/
      redis.module.ts
      redis.constants.ts
    otp/
      otp.module.ts
      otp.controller.ts
      otp.service.ts                 -- generate, store, rate-limit, verify
      dto/
        send-otp.dto.ts
        verify-otp.dto.ts
    channels/
      channels.module.ts
      channel-orchestrator.service.ts  -- multi-channel failover
    providers/
      providers.module.ts
      provider-router.service.ts       -- dynamic scoring + provider selection
      circuit-breaker.service.ts       -- per-provider circuit breaker (Redis-backed)
      provider-scorer.service.ts       -- scoring algorithm + metrics recalculation
      adapters/
        provider.interface.ts          -- SmsProviderAdapter interface
        fast2sms.adapter.ts            -- SMS, India
        msg91-sms.adapter.ts           -- SMS, India (stub)
        msg91-whatsapp.adapter.ts      -- WhatsApp, India (stub)
        msg91-voice.adapter.ts         -- Voice, India (stub)
        twilio-sms.adapter.ts          -- SMS, global (stub)
        twilio-whatsapp.adapter.ts     -- WhatsApp, global (stub)
        twilio-voice.adapter.ts        -- Voice, global (stub)
    webhooks/
      webhooks.module.ts
      webhooks.controller.ts           -- DLR callbacks
    phone/
      phone.module.ts
      phone.service.ts                 -- parse, validate, country/carrier detection
    health/
      health.module.ts
      health.controller.ts
  prisma/
    schema.prisma
  test/
```

---

## Environment Variables

```env
NODE_ENV=development
PORT=3001

DATABASE_URL=postgresql://...
REDIS_HOST=localhost
REDIS_PORT=6379

# Providers — SMS
FAST2SMS_API_KEY=
FAST2SMS_ROUTE=q
FAST2SMS_SENDER_ID=FSTSMS
FAST2SMS_DLT_TEMPLATE_ID=

MSG91_AUTH_KEY=
MSG91_SMS_TEMPLATE_ID=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Providers — WhatsApp
MSG91_WHATSAPP_TEMPLATE_ID=
TWILIO_WHATSAPP_FROM=

# Providers — Voice
TWILIO_VOICE_FROM=

# OTP Config
OTP_LENGTH=6
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=3
OTP_RATE_LIMIT_PER_10MIN=5
OTP_RATE_LIMIT_PER_HOUR=10
OTP_COOLDOWN_SECONDS=30
OTP_IP_RATE_LIMIT_PER_10MIN=20

# DLR Config
DLR_TIMEOUT_MS=10000
DLR_WEBHOOK_BASE_URL=

# Monitoring
ALERT_DELIVERY_RATE_THRESHOLD=0.95
ALERT_WEBHOOK_URL=
```

**Provider activation:** a provider adapter is active only when its env key is set. No key = adapter skipped in routing. This means you can deploy with just `FAST2SMS_API_KEY`, and later add MSG91/Twilio by just setting env vars — no code changes.

---

## Implementation Checklist

### Infrastructure (done)
- [x] NestJS project scaffold
- [x] Prisma schema (OtpAuditLog, ProviderHealth, DlrCallback)
- [x] Phone module (validation, country detection, masking, hashing)
- [x] Redis module (ioredis, global injection)
- [x] Health endpoint (Postgres + Redis)
- [x] Env validation

### Core OTP Logic
- [ ] OTP generation (crypto.randomInt) + Redis storage
- [ ] OTP verification (constant-time compare, max attempts)
- [ ] Rate limiting (per phone, per hour, per IP, cooldown)
- [ ] Send + Verify endpoints with DTOs

### Provider System
- [ ] SmsProviderAdapter interface
- [ ] Fast2SMS adapter (working)
- [ ] MSG91 SMS/WhatsApp/Voice adapters (stubs)
- [ ] Twilio SMS/WhatsApp/Voice adapters (stubs)
- [ ] Provider router (select + failover within channel)
- [ ] Circuit breaker (Redis-backed, per-provider per-country)
- [ ] Provider scorer (dynamic scoring, 5-min recalculation)
- [ ] Routing config (channel priority + provider registry)

### Orchestration
- [ ] Channel orchestrator (SMS -> WhatsApp -> Voice failover)
- [ ] Failover chain logging
- [ ] DLR webhook endpoints
- [ ] Audit log persistence

### Monitoring
- [ ] Provider health dashboard endpoint
- [ ] Alerting (delivery rate < threshold)

---

## Key Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| OTP storage | Redis | Fast reads, built-in TTL, no cleanup jobs |
| Audit log | PostgreSQL | Durable, queryable, compliance |
| Provider abstraction | Interface + adapters | Plug-and-play: new provider = 1 file + 1 config line |
| Provider activation | Env var presence | No code changes to add/remove providers |
| Routing | Dynamic score-based | Best provider wins, automatically adapts to failures |
| Circuit breaker | Redis-backed | Shared state across service instances |
| Phone storage | Masked + SHA256 hashed | Security: no raw phones in logs or Redis keys |
| Multi-channel | SMS -> WhatsApp -> Voice | Banking-grade, different failure modes |
| DLR monitoring | Webhook-based | Real delivery confirmation, not just provider acceptance |
| OTP generation | Internal only | Provider is a dumb pipe, never trust external generation |
