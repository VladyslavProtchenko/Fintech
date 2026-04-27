# Fintech Platform — Microservices Monorepo

Collection of self-hosted microservices for fintech operations. Each service lives in its own directory with independent dependencies and deployment.

## Stack (all services)

- **Language**: TypeScript strict (no `any`, no `as` without reason)
- **Runtime**: Node.js
- **Framework**: NestJS
- **DB**: PostgreSQL via Prisma
- **Queue**: BullMQ (Redis)
- **Config**: `@nestjs/config` + `class-validator` env validation
- **Testing**: Jest + Supertest (e2e)
- **Linting**: ESLint + Prettier
- **Build**: SWC (via `@nestjs/cli`)

## Architecture Conventions

### Project Structure (per service)

```
<service-name>/
  src/
    app.module.ts          — root module
    main.ts                — bootstrap
    config/
      env.validation.ts    — env schema with class-validator
    prisma/
      prisma.module.ts     — global Prisma module
      prisma.service.ts    — PrismaClient wrapper
    <domain>/
      <domain>.module.ts
      <domain>.controller.ts
      services/
        <name>.service.ts
    queue/                 — BullMQ processors & services (if applicable)
      <name>.processor.ts
      queue.module.ts
    health/
      health.controller.ts — /health endpoint (via @nestjs/terminus)
      health.module.ts
  prisma/
    schema.prisma
  test/
    app.e2e-spec.ts
```

### Prisma

- Custom client output: `generated/prisma` (not default `node_modules/.prisma/client`)
- PrismaService is a global NestJS module — import once in AppModule
- Use `@prisma/adapter-pg` for driver-based connection

### BullMQ

- Each queue = own processor class with `@Processor()` decorator
- Default retry: 3 attempts, exponential backoff (1s base)
- Timeouts defined per queue based on expected workload
- Use `QueueEvents` for cross-queue coordination and fallback logic

### API Design

- REST endpoints, JSON responses
- File uploads via Multer (multipart/form-data)
- Validate input at controller boundary (Pipes, DTOs with class-validator)
- Every service exposes `GET /health`

### Environment Variables

- Validated at startup via class-validator schema in `config/env.validation.ts`
- Common vars across services:
  ```
  NODE_ENV           development|production|test
  PORT               service-specific default
  DATABASE_URL       required (PostgreSQL connection string)
  REDIS_HOST         localhost
  REDIS_PORT         6379
  ```
- Service-specific vars documented in each service's own CLAUDE.md

### Error Handling

- Use NestJS built-in exception filters
- Handle race conditions via DB unique constraints + catch `P2002`
- Queue failures: rely on BullMQ retry mechanism, implement fallback logic for critical paths

## Scripts (standard across services)

```bash
npm run build          # nest build
npm run start:dev      # nest start --watch
npm run start:prod     # node dist/main
npm run lint           # eslint --fix
npm run test           # jest
npm run test:e2e       # jest with e2e config
```

## Services

| Directory | Description | Status |
|-----------|-------------|--------|
| `photo-service` | OCR receipt recognition (NestJS + BullMQ + Gemini) | Active |
| `otp-service` | OTP send/verify via SMS/WhatsApp/Voice, multi-provider failover | In Progress |

## Key Principles

- Each service is fully independent: own `package.json`, own Prisma schema, own deployment
- No shared code between services (yet) — extract to shared package only when 3+ services need it
- Secrets via env vars, never hardcoded
- Dedup strategies where applicable (SHA256 for files, unique constraints for data)
- Clean up temporary files after processing
- All external integrations (AI, GPU workers, etc.) behind service abstractions
