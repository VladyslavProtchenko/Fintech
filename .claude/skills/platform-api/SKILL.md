---
name: Platform API
description: >
  This skill should be used when the user asks to "generate platform backend",
  "create platform API", "build NestJS backend for platform", or as the third step
  in the platform generation pipeline after platform-design. Generates a complete
  NestJS backend for a white-label payment platform using @fintech/payment-sdk.
---

# Platform API

Generate a complete NestJS backend project at `platforms/<slug>/api/` that connects to the shared payment-service via `@fintech/payment-sdk`. All architecture decisions come from the strategy (platform-research) and the invariants.

## Input

From conversation context (produced by previous skills):
- Full strategy from platform-research (slug, ports, endpoint style, error format, DTO fields, module name, secrets)
- Design tokens from platform-design (not directly used by API, but slug and displayName needed)

## Pre-Generation Step — Read Reference Code

Before writing any files, read these to understand patterns and types:
- `packages/payment-sdk/src/` — SDK client methods and types (Transaction, Client, Wallet)
- `packages/shared-auth/src/` — exports (createAuthModule, JwtAuthGuard, CurrentUser, hashPassword, comparePassword)
- `packages/shared-prisma/src/` — withPrismaAdapterPg signature
- `packages/shared-config/src/` — BaseEnvironmentVariables fields, createValidator
- `platforms/apricot/api/src/` — reference implementation (latest, all bugs fixed)

## Workflow

### Step 1 — Project Config

Generate `package.json`, `tsconfig.json`, `nest-cli.json` following exact specifications in `references/file-list.md`.

### Step 2 — Prisma Schema

Generate `prisma/schema.prisma` with User model (paymentClientId? + walletId? for lazy provisioning) and `prisma.config.ts`.

### Step 3 — Environment

Generate `.env` with real values from strategy (paymentApiKey, databaseUrlFormat) and `.gitignore`.

### Step 4 — Core Modules

Generate in order:
1. `src/config/env.validation.ts` — extend BaseEnvironmentVariables
2. `src/prisma/` — PrismaModule (global) + PrismaService (one-line mixin)
3. `src/auth/` — AuthModule (with JwtModule.registerAsync), AuthController, AuthService, DTOs
4. `src/<moduleName>/` — PaymentService bridge, Controller, DTOs, MappedTransaction type
5. `src/user/` — UserController with email search, UserModule
6. `src/health/` — local HealthModule with TerminusModule, HealthController with SELECT 1
7. `src/common/filters/` — GlobalExceptionFilter with strategy's error format

### Step 5 — App Wiring

Generate `src/app.module.ts` and `src/main.ts`:
- app.module: ConfigModule.forRoot, createAuthModule(), AuthModule, PaymentModule, UserModule, HealthModule, PrismaModule
- main.ts: global prefix (from strategy), ValidationPipe, CORS, GlobalExceptionFilter, Swagger on `'docs'`

### Step 6 — Dockerfile

Generate multi-stage Dockerfile following the proven pattern from invariants.

## Key Implementation Details

### Payment Bridge (ensurePaymentClient)

```typescript
async ensurePaymentClient(userId: number): Promise<{ paymentClientId: string; walletId: string }> {
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.paymentClientId && user.walletId) {
    return { paymentClientId: user.paymentClientId, walletId: user.walletId };
  }
  const client = await this.paymentClient.createClient({
    externalId: `${platformId}-user-${userId}`,
    name: user.name ?? user.email,
    email: user.email,
    platformId,
  });
  if (!client.wallet?.id) {
    throw new BadRequestException('Wallet not created by payment-service');
  }
  await this.prisma.user.update({
    where: { id: userId },
    data: { paymentClientId: client.id, walletId: client.wallet.id },
  });
  return { paymentClientId: client.id, walletId: client.wallet.id };
}
```

### Transaction Mapping

Map SDK Transaction → MappedTransaction:
- Hide walletIds (internal detail)
- Derive `direction`: compare transaction walletId with user's walletId → `incoming` or `outgoing`
- Resolve counterparty name from local User table by paymentClientId

### GlobalExceptionFilter

Must handle three exception types:
1. `HttpException` → return in strategy's error format
2. `PaymentServiceError` → 422 for insufficient funds, 502 for others
3. Unknown → `console.error()` first, then generic 500

## Output

All files written to `platforms/<slug>/api/`. The project must be ready for `tsc --noEmit` compilation (verified in platform-deploy).

Do NOT pause — proceed immediately to platform-web.

## Reference Files

- **`references/invariants.md`** — architectural rules that must never be violated (shared packages, Prisma 7, TypeScript config, auth flow, Dockerfile pattern)
- **`references/file-list.md`** — complete ordered list of files to generate with code snippets
