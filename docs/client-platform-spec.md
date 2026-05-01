# Client Platform Specification

> How to generate a unique client project (backend + frontend) that uses `@fintech/payment-sdk` to communicate with the shared payment core.

## Overview

Each client gets two independent apps:

- **`<slug>-api`** — NestJS 11 backend (auth, business logic, payment-sdk bridge)
- **`<slug>-web`** — Next.js 15 frontend (landing + auth + dashboard)

Every generated project is **structurally unique**: different endpoint naming, different error formats, different UI, different naming conventions. No two clients should look like they share the same codebase.

---

## 1. Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  client-web  │────▶│  client-api   │────▶│ payment-service │
│  (Next.js)   │     │  (NestJS)     │     │   (core engine) │
└─────────────┘     └──────────────┘     └─────────────────┘
      Server            payment-sdk              PostgreSQL
   Actions/SC          (HTTP bridge)          (shared wallets)
```

- `client-web` talks ONLY to `client-api` via Server Actions and Server Components
- `client-api` talks to `payment-service` via `@fintech/payment-sdk`
- `payment-service` is never exposed to end users
- **Transfers are intra-platform only** — a user on client A cannot send money to a user on client B
- **Platform isolation via `platformId`** — payment-service uses `@@unique([email, platformId])` on Client. Same email can register on different platforms, each gets a separate wallet. `platformId` = client slug (e.g. "acme", "bolt")
- **All operations are synchronous** — no queues, no PENDING state. Every operation returns final status (COMPLETED or error) immediately

---

## 2. Functional Requirements

### 2.1 Pages

| Page | Auth | Description |
|------|------|-------------|
| `/` | No | Landing page — product description, CTA to login/register |
| `/login` | No | Email + password form |
| `/register` | No | Email + name + password form |
| `/dashboard` | Yes | Balance display, quick actions (deposit, send), recent transactions |
| `/deposit` | Yes | Amount input → confirm → balance increases instantly (prototype, no real payment) |
| `/send` | Yes | Email input → search user → amount input → confirm → transfer |
| `/history` | Yes | Full paginated transaction list with type filters |

### 2.2 User Flows

**Registration (lazy provisioning):**
1. User fills email + name + password
2. Backend creates LOCAL User only (passwordHash) — NO payment-service call
3. Returns JWT → set cookie → redirect to `/dashboard`
4. Payment-service client + wallet created lazily on first wallet access (balance/deposit/send)

**Login:**
1. Email + password → verify → JWT → cookie → redirect to `/dashboard`

**Deposit (prototype — no real payment gateway):**
1. User enters any amount (e.g., "500.00")
2. Confirm button
3. Server Action calls backend → backend calls `ensurePaymentClient()` then `paymentClient.topup(...)` → returns COMPLETED
4. `revalidatePath('/dashboard')` + `revalidatePath('/history')` → `redirect('/dashboard')`
5. User sees updated balance on dashboard

**Send money:**
1. User types recipient email
2. Client component calls `searchUser` server action
3. If found — show recipient name, enter amount
4. Confirm → Server Action calls backend → `ensurePaymentClient()` then `paymentClient.transfer(...)` → returns COMPLETED
5. `revalidatePath('/dashboard')` → show result (success / insufficient funds)
6. Send-form detects success via `useEffect` + `hasSubmitted` flag → shows "Wire Complete!" screen

**Transaction history:**
1. Server Component loads paginated list on render
2. Filter by type (re-fetches via searchParams)
3. Each row: direction (sent/received/deposit), amount (+/-), date, counterparty name

### 2.3 What's NOT Included

- No withdraw/cashout (prototype)
- No real payment gateway integration
- No KYC/verification
- No email notifications
- No admin panel
- No multi-currency
- No real-time updates (all operations are synchronous, page re-renders after action)

---

## 3. Backend (`platforms/<slug>/api`)

### 3.1 Tech Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | NestJS (strict TS, tsc build) | 11.x |
| ORM | Prisma (custom output `src/generated/prisma`) | 7.x |
| DB driver | @prisma/adapter-pg + pg (driver-based) | 7.x |
| Auth | JWT + Passport + bcrypt (via `@fintech/shared-auth`) | passport-jwt 4.x |
| Validation | class-validator + class-transformer | latest |
| Config | @nestjs/config + `@fintech/shared-config` env schema | latest |
| Health | @nestjs/terminus via `@fintech/shared-health` → `GET /health` | latest |

### 3.2 Database Schema (Prisma)

Each client backend has its own PostgreSQL database:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"  # MUST be inside src/ for TypeScript rootDir
}

datasource db {
  provider = "postgresql"
  # NO url here — Prisma 7 removed it. URL goes in prisma.config.ts
}

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  passwordHash    String
  name            String
  paymentClientId String?  @unique  // maps to Client.id in payment-service (lazy — created on first wallet access)
  walletId        String?  @unique  // cached from payment-service for fast counterparty lookups (lazy)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Why `walletId`?** SDK `Transaction` returns `fromWalletId`/`toWalletId`. To determine direction (sent/received) and resolve counterparty names, the bridge needs to match walletIds to local users. Storing `walletId` avoids extra SDK calls.

**Registration** creates a local User only (email, name, passwordHash). No payment-service call.

**Lazy payment client provisioning**: the payment-service client + wallet is created on first wallet access (balance, deposit, transfer). The `AccountService.ensurePaymentClient(userId)` method:
1. Load User from DB
2. If `paymentClientId` and `walletId` are already set — return immediately
3. Otherwise call `paymentClient.createClient({ email, name, platformId })` → validate walletId exists → update User with `paymentClientId` + `walletId`
4. If wallet is null/undefined after creation — throw `BadRequestException('Payment wallet was not provisioned')`

This decouples auth from payment-service — registration works even when payment-service is down.

If `createClient` throws 409 (duplicate email+platformId in payment-service) — propagate as error.

### 3.3 Prisma 7 Configuration

`prisma.config.ts` at the project root:

```typescript
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
```

No `url` in the `datasource` block of `schema.prisma`. Import from `generated/prisma/client`.

#### PrismaService (shared mixin)

Use `withPrismaAdapterPg(PrismaClient)` mixin from `@fintech/shared-prisma`:

```typescript
import { Injectable } from '@nestjs/common';
import { withPrismaAdapterPg } from '@fintech/shared-prisma';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends withPrismaAdapterPg(PrismaClient) {}
```

**Do NOT manually create Pool/PrismaPg** — the mixin handles it.

### 3.4 Project Structure

```
platforms/<slug>/api/
  prisma/
    schema.prisma
    migrations/
  prisma.config.ts
  nest-cli.json
  src/
    generated/prisma/          # gitignored, MUST be inside src/ for rootDir
    main.ts                    # bootstrap: ValidationPipe, CORS, Swagger
    app.module.ts
    config/
      env.validation.ts        # extends BaseEnvironmentVariables from @fintech/shared-config
    prisma/
      prisma.module.ts         # global module
      prisma.service.ts        # one-liner using shared mixin
    auth/
      auth.module.ts           # imports JwtModule.registerAsync() directly
      auth.controller.ts
      auth.service.ts          # register (local User only) + login
      dto/
        register.dto.ts
        login.dto.ts
    account/                   # name varies per client (wallet/, funds/, account/)
      account.module.ts
      account.service.ts       # wraps PaymentClient + ensurePaymentClient + maps responses
      account.controller.ts
      dto/
        fund.dto.ts
        wire.dto.ts
      types/
        mapped-transaction.ts
    user/                      # user lookup for transfers
      user.module.ts
      user.controller.ts       # GET /v1/recipients/check?email=...
    health/
      health.module.ts         # local module with TerminusModule (NOT createHealthModule — returns DynamicModule, can't extend)
      health.controller.ts
    common/
      filters/
        global-exception.filter.ts  # handles HttpException + PaymentServiceError
  package.json
  tsconfig.json
  .env
  .gitignore
  Dockerfile
```

**Auth files NOT generated locally** (provided by `@fintech/shared-auth`):
- `jwt.strategy.ts` — NOT needed
- `jwt-auth.guard.ts` — use `JwtAuthGuard` from `@fintech/shared-auth`
- `current-user.decorator.ts` — use `@CurrentUser()` from `@fintech/shared-auth`
- `jwt-payload.ts` — use `JwtPayload` type from `@fintech/shared-auth`

### 3.5 `main.ts` Bootstrap

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));

app.enableCors({
  origin: configService.get('FRONTEND_URL', 'http://localhost:<web-port>'),
  credentials: true,
});

app.useGlobalFilters(new GlobalExceptionFilter());

// Swagger — setup path must be 'docs' (not 'api/docs')
// Caddy strips /api/ prefix, so public URL becomes http://<slug>.localhost/api/docs
SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
```

### 3.6 `nest-cli.json`

Use default tsc builder (NOT SWC — SWC has issues with files outside sourceRoot in monorepo setups):

```json
{
  "sourceRoot": "src",
  "entryFile": "main",
  "compilerOptions": { "deleteOutDir": true }
}
```

### 3.7 Auth Flow

1. **Register**: hash password (`hashPassword` from `@fintech/shared-auth`) → save User (email, name, passwordHash — NO payment-service call) → return JWT. Payment client is created lazily on first wallet access via `ensurePaymentClient()`.
2. **Login**: find by email → verify (`comparePassword` from `@fintech/shared-auth`) → return JWT
3. **JWT Payload**: `{ sub: userId, email: string }` — `JwtPayload` type from `@fintech/shared-auth`
4. **Protected routes**: `@UseGuards(JwtAuthGuard)` + `@CurrentUser()` decorator — both from `@fintech/shared-auth`

**AuthModule must import `JwtModule.registerAsync(...)` directly** — `createAuthModule()` is `@Global` but its `JwtService` doesn't propagate to child modules that import their own `JwtModule`.

```typescript
// auth.module.ts
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

Also add `createAuthModule()` to `app.module.ts` imports for JwtStrategy/JwtAuthGuard global availability.

### 3.8 Payment Bridge + Response Mapping

The payment bridge wraps `PaymentClient` and **maps all responses** to hide payment-service internals.

**Lazy payment client provisioning** — every wallet operation calls `ensurePaymentClient(userId)` first:

```typescript
private async ensurePaymentClient(userId: string) {
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.paymentClientId && user.walletId) return user;

  const paymentClient = await this.client.createClient({
    email: user.email, name: user.name, platformId: this.platformId,
  });

  const walletId = paymentClient.wallet?.id;
  if (!walletId) {
    throw new BadRequestException('Payment wallet was not provisioned');
  }

  return this.prisma.user.update({
    where: { id: userId },
    data: { paymentClientId: paymentClient.id, walletId },
  });
}
```

**Getting balance** — SDK has no `getBalance()`. Use `getClient(paymentClientId)` → extract `client.wallet.balance`:

```typescript
async getBalance(userId: string): Promise<string> {
  const user = await this.ensurePaymentClient(userId);
  const client = await this.client.getClient(user.paymentClientId!);
  return client.wallet?.balance ?? '0';
}
```

**Transaction mapping** — SDK returns raw `Transaction` with `fromWalletId`/`toWalletId` (payment-service internals). Bridge must map to a client-friendly format:

```typescript
// What SDK returns:
{ id, fromWalletId, toWalletId, amount, type, status, idempotencyKey, createdAt }

// What bridge returns to frontend:
{
  id: string;
  type: 'deposit' | 'sent' | 'received';  // derived from SDK type + wallet comparison
  sum: string;       // field name varies per client (amount/sum/value)
  status: string;
  counterparty: string | null;  // recipient/sender name, null for deposits
  createdAt: string;
}
```

**Deriving direction:**
- `type === 'TOPUP'` → `deposit`
- `type === 'TRANSFER'` + `fromWalletId === myWalletId` → `sent`
- `type === 'TRANSFER'` + `toWalletId === myWalletId` → `received`

**Resolving counterparty name:**
`walletId` is stored on the User model (see section 3.2). Counterparty lookup is `prisma.user.findMany({ where: { walletId: { in: [...walletIds] } } })` — batch resolve for ledger, single lookup for transfers.

**`MappedTransaction` interface** (defined in the payment module):

```typescript
interface MappedTransaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  sum: string;        // field name varies per client
  status: string;
  counterparty: string | null;  // name, null for deposits
  createdAt: string;
}
```

**Full bridge pattern:**

```typescript
@Injectable()
export class AccountService {
  private readonly client: PaymentClient;
  private readonly platformId: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.client = new PaymentClient({
      baseUrl: config.getOrThrow('PAYMENT_API_URL'),
      apiKey: config.getOrThrow('PAYMENT_API_KEY'),
    });
    this.platformId = config.getOrThrow('PLATFORM_ID');
  }

  async getBalance(userId: string): Promise<string> {
    const user = await this.ensurePaymentClient(userId);
    const paymentClient = await this.client.getClient(user.paymentClientId!);
    return paymentClient.wallet?.balance ?? '0';
  }

  async fund(userId: string, sum: string): Promise<MappedTransaction> {
    const user = await this.ensurePaymentClient(userId);
    try {
      const tx = await this.client.topup({
        clientId: user.paymentClientId!,
        amount: sum,
        idempotencyKey: crypto.randomUUID(),
      });
      return this.mapTransaction(tx, user.walletId!);
    } catch (err) {
      if (err instanceof PaymentServiceError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async wire(userId: string, recipientEmail: string, sum: string): Promise<MappedTransaction> {
    const [sender, recipientUser] = await Promise.all([
      this.ensurePaymentClient(userId),
      this.prisma.user.findUnique({ where: { email: recipientEmail } }),
    ]);

    if (!recipientUser) throw new NotFoundException('Recipient not found');
    if (sender.id === recipientUser.id) throw new BadRequestException('Cannot wire to yourself');

    const recipient = await this.ensurePaymentClient(recipientUser.id);

    try {
      const tx = await this.client.transfer({
        fromClientId: sender.paymentClientId!,
        toClientId: recipient.paymentClientId!,
        amount: sum,
        idempotencyKey: crypto.randomUUID(),
      });
      return this.mapTransaction(tx, sender.walletId!, new Map([[recipient.walletId!, recipient.name]]));
    } catch (err) {
      if (err instanceof PaymentServiceError) {
        if (err.isInsufficientFunds) throw new BadRequestException('Insufficient funds');
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async getLedger(userId: string, page?: number, limit?: number, type?: string) {
    const user = await this.ensurePaymentClient(userId);

    let sdkType: 'TOPUP' | 'TRANSFER' | undefined;
    if (type === 'deposit') sdkType = 'TOPUP';
    if (type === 'sent' || type === 'received') sdkType = 'TRANSFER';

    const result = await this.client.listTransactions({
      clientId: user.paymentClientId!,
      page, limit, type: sdkType,
    });

    // Batch-resolve counterparty names
    const walletIds = new Set<string>();
    for (const tx of result.items) {
      if (tx.fromWalletId && tx.fromWalletId !== user.walletId) walletIds.add(tx.fromWalletId);
      if (tx.toWalletId && tx.toWalletId !== user.walletId) walletIds.add(tx.toWalletId);
    }
    const counterparties = await this.prisma.user.findMany({
      where: { walletId: { in: [...walletIds] } },
      select: { walletId: true, name: true },
    });
    const nameMap = new Map(counterparties.map(u => [u.walletId, u.name]));

    let items = result.items.map(tx => this.mapTransaction(tx, user.walletId!, nameMap));

    // Post-filter 'sent' vs 'received' (both are SDK type TRANSFER)
    if (type === 'sent' || type === 'received') {
      items = items.filter(tx => tx.type === type);
    }

    return { items, total: result.total, page: result.page, limit: result.limit };
  }

  /** Lazily creates a payment-service client + wallet on first wallet access */
  private async ensurePaymentClient(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.paymentClientId && user.walletId) return user;

    const paymentClient = await this.client.createClient({
      email: user.email, name: user.name, platformId: this.platformId,
    });

    const walletId = paymentClient.wallet?.id;
    if (!walletId) {
      throw new BadRequestException('Payment wallet was not provisioned');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { paymentClientId: paymentClient.id, walletId },
    });
  }

  private mapTransaction(
    tx: Transaction,
    myWalletId: string,
    nameMap?: Map<string | null, string>,
  ): MappedTransaction {
    let txType: 'deposit' | 'sent' | 'received';
    let counterpartyWalletId: string | null = null;

    if (tx.type === 'TOPUP') {
      txType = 'deposit';
    } else if (tx.fromWalletId === myWalletId) {
      txType = 'sent';
      counterpartyWalletId = tx.toWalletId ?? null;
    } else {
      txType = 'received';
      counterpartyWalletId = tx.fromWalletId ?? null;
    }

    return {
      id: tx.id,
      type: txType,
      sum: tx.amount,
      status: tx.status.toLowerCase(),
      counterparty: counterpartyWalletId && nameMap ? (nameMap.get(counterpartyWalletId) ?? null) : null,
      createdAt: tx.createdAt,
    };
  }
}
```

### 3.9 User Search Endpoint

For the "send money" flow, frontend needs to check if recipient exists:

```
GET /v1/recipients/check?email=john@example.com
→ { found: true, name: "John Doe" }
→ { found: false }
```

Protected by JWT. Returns only `found` + `name` — no IDs, no balance.

### 3.10 Idempotency Keys

- Generated by backend as `crypto.randomUUID()` before each SDK call
- Frontend never deals with idempotency — it's backend's concern

### 3.11 Error Handling

Each client backend has its OWN error format via `GlobalExceptionFilter`. Styles:

**Style A** (nested): `{ "error": { "type": "VALIDATION_ERROR", "detail": "...", "status": 400 } }`
**Style B** (flat): `{ "code": "validation_failed", "message": "...", "statusCode": 400 }`
**Style C** (API): `{ "success": false, "error": { "code": "ERR_VALIDATION", "message": "..." } }`
**Style D** (verbose): `{ "ok": false, "errors": [{ "field": "amount", "reason": "Required" }] }`

`GlobalExceptionFilter` handles THREE sources of errors:
1. **NestJS `HttpException`** (from `ValidationPipe`, guards, own throws) — contains `message` string or `message[]` array.
2. **`PaymentServiceError`** (from SDK, may leak through bridge) — map `isInsufficientFunds` → 422, otherwise → 502. Always extract `message` and format to client's error style.
3. **Unknown errors** — log with `console.error`, return 500 with generic message.

```typescript
import { PaymentServiceError } from '@fintech/payment-sdk';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      // ... format to client's error style
      return;
    }

    if (exception instanceof PaymentServiceError) {
      const status = exception.isInsufficientFunds
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.BAD_GATEWAY;
      // ... format to client's error style with exception.message
      return;
    }

    console.error('Unhandled exception:', exception);
    // ... return 500 with generic message
  }
}
```

Never leak payment-service error structure (codes, traceId, original format).

### 3.12 Environment Variables

```env
NODE_ENV=development
PORT=<unique, e.g. 3014>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<slug>_db
JWT_SECRET=<random 32+ chars>
JWT_EXPIRES_IN=7d
PAYMENT_API_URL=http://localhost:3004
PAYMENT_API_KEY=<read from apps/payment-service/.env — NEVER guess this value>
PLATFORM_ID=<client slug, e.g. "cactus">
FRONTEND_URL=http://localhost:<web-port>
```

**IMPORTANT:** Before writing `.env`, read actual values from:
- `PAYMENT_API_KEY` → `apps/payment-service/.env` (field `API_KEY`)
- `DATABASE_URL` format → any existing platform's `.env` (e.g. `platforms/orange/api/.env`) — the username/password may differ from `postgres:postgres` in local dev

All validated at startup via class-validator (extend `BaseEnvironmentVariables` from `@fintech/shared-config`). App crashes on missing required vars.

### 3.13 Endpoint Naming (Unique Per Client)

| Operation | Style A | Style B | Style C | Style D |
|-----------|---------|---------|---------|---------|
| Register | `POST /auth/register` | `POST /signup` | `POST /api/users` | `POST /v1/account/create` |
| Login | `POST /auth/login` | `POST /signin` | `POST /api/sessions` | `POST /v1/account/login` |
| Balance | `GET /wallet/balance` | `GET /account/funds` | `GET /api/balance` | `GET /v1/wallet` |
| Deposit | `POST /wallet/deposit` | `POST /funds/add` | `POST /api/deposit` | `POST /v1/wallet/fund` |
| Transfer | `POST /wallet/transfer` | `POST /funds/send` | `POST /api/send` | `POST /v1/wallet/send` |
| Search user | `GET /users/search` | `GET /members/find` | `GET /api/users/lookup` | `GET /v1/recipients/check` |
| History | `GET /wallet/history` | `GET /funds/activity` | `GET /api/transactions` | `GET /v1/wallet/ledger` |
| Health | `GET /health` | `GET /health` | `GET /health` | `GET /health` |

### 3.14 Dockerfile

Multi-stage build. Context is monorepo root (for pnpm workspace deps):

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY packages/shared-auth ./packages/shared-auth
COPY packages/shared-config ./packages/shared-config
COPY packages/shared-health ./packages/shared-health
COPY packages/shared-prisma ./packages/shared-prisma
COPY platforms/<slug>/api ./platforms/<slug>/api

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/<slug>/api
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS production
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/<slug>/api/dist ./platforms/<slug>/api/dist
COPY --from=builder /app/platforms/<slug>/api/src/generated ./platforms/<slug>/api/src/generated
COPY platforms/<slug>/api/package.json ./platforms/<slug>/api/package.json
COPY platforms/<slug>/api/prisma ./platforms/<slug>/api/prisma
COPY platforms/<slug>/api/prisma.config.ts ./platforms/<slug>/api/prisma.config.ts

RUN pnpm install --frozen-lockfile

WORKDIR /app/platforms/<slug>/api
EXPOSE <apiPort>
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

**Key points:**
- Copy full `packages/` from builder (includes built dist/) — shared packages must be available at runtime
- `corepack enable` for pnpm in both stages
- `prisma.config.ts` MUST be copied to production stage (Prisma 7 requires it)

---

## 4. Frontend (`platforms/<slug>/web`)

### 4.1 Tech Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Server Components + Server Actions) | 15.x |
| Styling | Tailwind CSS | 4.x |
| HTTP | Native fetch (server-side only) | — |
| Auth | JWT in httpOnly cookie | — |

No TanStack Query, no Zustand, no client-side state management libraries. Server Components handle data loading, Server Actions handle mutations. Only forms are `'use client'`.

### 4.2 Project Structure

```
platforms/<slug>/web/
  src/
    app/
      layout.tsx               # root: fonts, metadata, global styles, favicon
      page.tsx                  # landing page
      (auth)/
        login/page.tsx
        register/page.tsx
      (dashboard)/
        layout.tsx              # auth guard + dashboard shell (nav, sidebar)
        dashboard/page.tsx      # SC: loads balance + recent transactions
        deposit/page.tsx        # SC: renders deposit form
        send/page.tsx           # SC: renders send form
        history/page.tsx        # SC: loads paginated list (searchParams for filter/page)
    lib/
      api.ts                    # server-side fetch wrapper + ApiError class
    components/
      ui/                       # button, input, card, badge
      layout/                   # header, sidebar, nav, footer
      forms/
        login-form.tsx          # 'use client' — form with useActionState
        register-form.tsx       # 'use client'
        deposit-form.tsx        # 'use client'
        send-form.tsx           # 'use client' — email search + amount + useEffect success detection
    actions/
      auth.ts                   # server actions: login, register, logout
      payment.ts                # server actions: deposit (+ redirect), transfer
      user.ts                   # server action: searchUser (for send form)
  public/
    logo.svg                    # full logo (icon + wordmark)
    favicon.svg                 # icon only
  next.config.ts
  package.json
  tsconfig.json
  .env.example
  .env.local                    # gitignored, needed for dev
  .gitignore
  .dockerignore                 # REQUIRED: node_modules, .next, .env.local
  Dockerfile
```

### 4.3 Data Flow Pattern

**Reading data (Server Components):**
```
page.tsx (Server Component)
  → reads cookie via cookies()
  → calls api() with token
  → renders HTML with data
  → graceful error handling: catch non-401 errors, show empty state
  → no loading spinners, no client JS
```

**Mutations (Server Actions):**
```
form (Client Component with useActionState)
  → calls server action
  → server action calls api() with token from cookie
  → on success: revalidatePath('/dashboard') + redirect (deposit) or return null (wire)
  → on error: return error string (displayed in form)
```

**User search (interactive, from client):**
```
send-form.tsx ('use client')
  → calls searchUser server action on email input blur/submit
  → server action calls api() → returns { found, name } or { found: false }
  → form shows recipient name or "not found"
```

### 4.4 API Client (`lib/api.ts`)

Server-side only fetch wrapper with `ApiError` class (no separate `errors.ts`):

```typescript
import { cookies } from 'next/headers';

const API_URL = process.env['API_URL']!;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const msg = ApiError.extractMessage(body);
    super(msg);
    this.name = 'ApiError';
  }

  get isUnauthorized() { return this.status === 401; }

  private static extractMessage(body: unknown): string {
    // Parse error based on backend's error format
    // Each platform must adapt this to match its backend error style
    if (typeof body !== 'object' || body === null) return 'Request failed';
    const b = body as { errors?: Array<{ reason?: string }> };
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      return b.errors[0].reason ?? 'Request failed';
    }
    return 'Request failed';
  }
}

interface ApiOptions {
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  let url = `${API_URL}${path}`;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v != null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ errors: [{ reason: 'Request failed' }] }));
    throw new ApiError(res.status, error);
  }

  return res.json() as Promise<T>;
}
```

**Key details:**
- `ApiError` is defined in the same file (no separate `lib/errors.ts`)
- `query` option for GET requests with query parameters (don't inline in path string)
- Used only in Server Components and Server Actions — never imported from `'use client'` files

### 4.5 Auth Flow

1. User submits login/register form → server action calls backend
2. Backend returns JWT → server action sets httpOnly cookie:
   ```typescript
   const cookieStore = await cookies();
   cookieStore.set('token', jwt, {
     httpOnly: true,
     secure: process.env['NODE_ENV'] === 'production',
     sameSite: 'lax',
     path: '/',
     maxAge: 60 * 60 * 24 * 7, // 7 days
   });
   redirect('/dashboard');
   ```
3. Dashboard layout reads cookie — if missing → `redirect('/login')`
4. Logout → server action deletes cookie → redirect to `/`

### 4.6 Pages Detail

**Landing (`/`):**
- Hero section with product name + tagline
- 3-4 feature cards (fast transfers, secure, etc.)
- CTA buttons: "Get Started" → `/register`, "Sign In" → `/login`
- Footer with minimal links
- Fully static Server Component

**Dashboard (`/dashboard`):**
- Server Component loads balance + last 5 transactions on render
- **Graceful error handling**: wrap API calls in try/catch, show empty state (balance $0, no transactions) if payment-service is down or wallet not provisioned
- Balance card (large number, USD)
- Quick action buttons: "Deposit" and "Send Money" (links to `/deposit`, `/send`)
- Recent transactions list (links to `/history`)

**Deposit (`/deposit`):**
- `deposit-form.tsx` (`'use client'`) with `useActionState`
- Amount input (number)
- "Confirm" button
- Server action: calls backend deposit → `revalidatePath('/dashboard')` + `revalidatePath('/history')` → `redirect('/dashboard')`
- User sees updated balance on dashboard immediately

**Send (`/send`):**
- `send-form.tsx` (`'use client'`) — multi-step form:
  - Step 1: email input → button triggers `searchUser` server action → shows name or "not found"
  - Step 2: amount input (only visible if user found)
  - Submit triggers `wireAction` via `useActionState`
- **Success detection pattern** (avoids stale closure bug):
  ```typescript
  const [sendError, sendFormAction, pending] = useActionState(wireAction, null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (hasSubmitted && !pending && sendError === null) {
      setStep('done');
    }
  }, [hasSubmitted, pending, sendError]);

  // In form action:
  action={(fd) => {
    setHasSubmitted(true);
    sendFormAction(fd);
  }}
  ```
  **DO NOT check `sendError` inside the action wrapper** — it captures stale closure value.
- Step 3: "Wire Complete!" success screen with back to dashboard link

**History (`/history`):**
- Server Component reads `searchParams` for page and type filter
- Calls backend with `query` option → renders list
- Filter: links/buttons that set `?type=deposit` / `?type=sent` / `?type=received`
- Pagination: links with `?page=2` etc.
- Each row: type badge, amount (+/-), date, status, counterparty name
- No client JS needed — all via URL searchParams

### 4.7 Design Uniqueness

Each generated frontend must have a visually distinct identity:

- **Color scheme**: unique primary/secondary/accent (generate from random hue)
- **Typography**: different Google Fonts pairing (heading + body)
- **Layout variant**: sidebar-left / sidebar-right / top-nav / minimal
- **Terminology**: unique wording for all actions:
  - "Send Money" vs "Transfer Funds" vs "Pay Someone" vs "Wire Money"
  - "Deposit" vs "Add Funds" vs "Top Up" vs "Load Balance"
  - "Balance" vs "Available Funds" vs "Account Total" vs "My Money"
- **Landing page style**: hero-centered / hero-split / hero-gradient / minimal
- **Transaction display**: table / card list / timeline
- **Brand**: unique name, tagline, logo SVG, favicon SVG

### 4.8 Environment Variables

```env
NEXT_PUBLIC_APP_NAME=<client display name>
API_URL=http://localhost:<client-api-port>
```

`API_URL` is server-only (no `NEXT_PUBLIC_` prefix). Only `NEXT_PUBLIC_APP_NAME` is exposed to client.

### 4.9 Running on Custom Port

```json
{
  "scripts": {
    "dev": "next dev --port <web-port>",
    "build": "next build",
    "start": "next start --port <web-port>"
  }
}
```

---

## 5. Monorepo Integration

### 5.1 Location

```
platforms/
  <slug>/
    api/       # NestJS backend
    web/       # Next.js frontend
    docker-compose.yml
packages/
  payment-sdk/         # already exists
  shared-auth/         # already exists
  shared-prisma/       # already exists
  shared-health/       # already exists
  shared-config/       # already exists
```

### 5.2 tsconfig.base.json

`@fintech/*` path aliases are already configured in the root tsconfig. Each platform's `tsconfig.json` overrides them to point at `dist/index` instead of source.

### 5.3 Backend Dependencies

```json
{
  "name": "@fintech/<slug>-api",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "prisma generate && nest start --watch",
    "start:prod": "node dist/main"
  },
  "dependencies": {
    "@fintech/payment-sdk": "workspace:*",
    "@fintech/shared-auth": "workspace:*",
    "@fintech/shared-prisma": "workspace:*",
    "@fintech/shared-health": "workspace:*",
    "@fintech/shared-config": "workspace:*",
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/swagger": "^11.0.0",
    "@nestjs/terminus": "^11.0.0",
    "@prisma/adapter-pg": "^7.0.0",
    "pg": "^8.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "dotenv": "^16.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.0.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.0.0",
    "@types/passport-jwt": "^4.0.0",
    "prisma": "^7.0.0",
    "typescript": "^5.7.0"
  }
}
```

Note: `bcrypt` and `@types/bcrypt` are NOT needed — `@fintech/shared-auth` provides `hashPassword`/`comparePassword`.

### 5.4 Frontend Dependencies

```json
{
  "name": "@fintech/<slug>-web",
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0"
  }
}
```

### 5.5 tsconfig (backend)

**Critical:** Override `incremental: false`, set `rootDir: "./src"`, and override ALL `@fintech/*` paths to point at compiled `dist/index` (3 levels up from `platforms/<slug>/api/`):

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": false,
    "baseUrl": "./",
    "paths": {
      "@fintech/payment-sdk": ["../../../packages/payment-sdk/dist/index"],
      "@fintech/shared-auth": ["../../../packages/shared-auth/dist/index"],
      "@fintech/shared-prisma": ["../../../packages/shared-prisma/dist/index"],
      "@fintech/shared-health": ["../../../packages/shared-health/dist/index"],
      "@fintech/shared-config": ["../../../packages/shared-config/dist/index"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Why `dist/index` in paths?** The base tsconfig points to `packages/*/src/index.ts`. When TypeScript resolves this, it includes SDK source in compilation, expanding `rootDir` to the workspace root. Pointing to `dist/index` makes TypeScript read only `.d.ts` files.

**Why `incremental: false`?** Combined with `deleteOutDir: true` in nest-cli.json, incremental mode causes stale `.tsbuildinfo` — tsc thinks nothing changed and skips emission.

### 5.6 pnpm v10 Native Dependencies

pnpm v10 blocks native build scripts by default. Check root `package.json` has:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["bcrypt", "@nestjs/core", "prisma", "unrs-resolver"]
  }
}
```

### 5.7 Frontend .env.local

Create `.env.local` immediately (not just `.env.example`):

```env
NEXT_PUBLIC_APP_URL=http://localhost:<web-port>
API_URL=http://localhost:<api-port>
```

This file is gitignored but needed for `pnpm dev` to work.

### 5.8 Docker

Use `platforms/<slug>/docker-compose.yml` with Caddy labels for `<slug>.localhost` routing. See SKILL.md section 7 for full template.

### 5.9 Database

Add to `docker/postgres/init.sql`:
```sql
CREATE DATABASE <slug>_db;
```

---

## 6. Generation Rules (for Claude Code skill)

### 6.1 Check Existing Clients

Before generating, scan `platforms/` for existing platform directories. Read `docs/client-registry.md` for used ports, styles, colors. New client must not duplicate any.

### 6.2 Randomize Structure

- Unique endpoint naming style
- Unique error response format and error code naming
- Unique DTO field names where possible (`amount` vs `sum` vs `value`)
- Unique module/file naming (`payment/` vs `wallet/` vs `funds/` vs `account/`)

### 6.3 Randomize Design

- Unique color palette (random hue → derive primary/secondary/accent)
- Unique Google Fonts pairing
- Unique dashboard layout variant
- Unique copy (app name, tagline, feature text, button labels)
- Unique landing page style
- Unique transaction display style

### 6.4 Maintain Invariants

Every project MUST:

- Use `@fintech/payment-sdk` for all payment operations
- NestJS 11 + Prisma 7 conventions (no `url` in datasource, output inside `src/`)
- PrismaService via `withPrismaAdapterPg(PrismaClient)` from `@fintech/shared-prisma`
- Auth via `@fintech/shared-auth` — `createAuthModule()`, `JwtAuthGuard`, `CurrentUser`, `hashPassword`, `comparePassword`
- AuthModule imports `JwtModule.registerAsync(...)` directly
- Health via local `HealthModule` with `TerminusModule` (NOT `createHealthModule` — it returns DynamicModule which cannot be extended)
- Env validation via `BaseEnvironmentVariables` + `createValidator` from `@fintech/shared-config`
- `User` model with `paymentClientId?` + `walletId?` optional fields (lazy provisioning)
- Register: create local User only (NO payment-service call)
- `ensurePaymentClient()` with walletId null check
- `GlobalExceptionFilter` handles `HttpException` + `PaymentServiceError`
- `ValidationPipe` with whitelist + forbidNonWhitelisted
- `CORS` for frontend origin
- Swagger in dev mode
- `GET /health` (public)
- Env validation at startup (crash on missing)
- Never expose payment-service details to frontend
- Strict TS, no `any`
- Frontend: Server Components for data (graceful error handling), Server Actions for mutations
- Frontend: httpOnly cookies for auth, `lib/api.ts` is server-only with `query` support
- Frontend: `ApiError` in `api.ts` (not separate `errors.ts`)
- Frontend: forms use `useActionState` pattern
- Frontend: send-form success detection via `useEffect` + `hasSubmitted` (no stale closure)
- Frontend: deposit action → `redirect('/dashboard')` after success
- Frontend: history uses URL searchParams for pagination/filters
- Idempotency keys generated by backend as UUID v4

### 6.5 Naming Convention

Given slug `cactus`:
- Backend: `platforms/cactus/api/`, package `@fintech/cactus-api`
- Frontend: `platforms/cactus/web/`, package `@fintech/cactus-web`
- Database: `cactus_db`
- Ports: sequential from 3014 (greenapple=3010/3011, orange=3012/3013, cactus=3014/3015; next=3016/3017)

---

## 7. Client Registry

Track all generated clients in `docs/client-registry.md`:

```markdown
| Slug | API Port | Web Port | Endpoint Style | Error Style | Color Hue | Layout | Status |
|------|----------|----------|----------------|-------------|-----------|--------|--------|
| greenapple | 3010 | 3011 | /account/* | nested | 142 (green) | top-nav | active |
| orange | 3012 | 3013 | /wallet/* | nested-A | 30 (orange) | sidebar-left | active |
| cactus | 3014 | 3015 | /v1/wallet/* | verbose-D | 165 (teal) | sidebar-left | active |
```

Claude Code skill must read this before generating and update it after.

---

## 8. Generation Checklist

**Backend:**
- [ ] `prisma.config.ts` with `defineConfig`
- [ ] `schema.prisma` — no `url` in datasource
- [ ] Import from `generated/prisma/client`
- [ ] `User` model with `paymentClientId? @unique` + `walletId? @unique` (optional — lazy provisioning)
- [ ] Registration: local User only (NO payment-service call)
- [ ] `ensurePaymentClient()` with walletId null check (throw if null)
- [ ] `PLATFORM_ID` env var set to client slug
- [ ] 409 duplicate email+platform handled
- [ ] AuthModule imports `JwtModule.registerAsync(...)` directly
- [ ] `createAuthModule()` in app.module.ts for JwtStrategy/JwtAuthGuard
- [ ] `hashPassword`/`comparePassword` from `@fintech/shared-auth` (NOT local bcrypt)
- [ ] `JwtAuthGuard` + `@CurrentUser()` from `@fintech/shared-auth`
- [ ] Payment bridge: `ensurePaymentClient()` before every wallet operation
- [ ] Balance via `getClient()` → `wallet.balance`
- [ ] Transaction mapping: hides walletIds, adds direction (deposit/sent/received) + counterparty name
- [ ] Transfer: recipient found in LOCAL User table by email
- [ ] Counterparty name resolved via `walletId` → local User lookup
- [ ] User search endpoint: returns only `{ found, name }` — no IDs
- [ ] Idempotency keys as UUID v4 (backend generates)
- [ ] `GlobalExceptionFilter` handles `HttpException` + `PaymentServiceError` + unknown
- [ ] Payment-service IDs/errors never leaked
- [ ] `ValidationPipe` in `main.ts`
- [ ] CORS enabled
- [ ] Swagger (dev)
- [ ] `nest-cli.json` with tsc builder (NOT SWC), `deleteOutDir: true`
- [ ] `tsconfig.json`: `rootDir: "./src"`, `incremental: false`, ALL paths → `../../../packages/<pkg>/dist/index`
- [ ] Prisma output: `../src/generated/prisma` (inside src/)
- [ ] PrismaService uses `withPrismaAdapterPg` mixin from `@fintech/shared-prisma`
- [ ] `start:dev` script: `prisma generate && nest start --watch`
- [ ] Env validation via `@fintech/shared-config` at startup
- [ ] `GET /health` public via local HealthModule with TerminusModule
- [ ] Swagger setup path: `'docs'` (Caddy strips `/api/` → public URL `/api/docs`)
- [ ] Dockerfile with multi-stage build (corepack, full packages copy, prisma.config.ts in production)
- [ ] `.gitignore` includes `generated/`, `dist/`, `.env`, `src/generated/`

**Frontend:**
- [ ] `API_URL` is server-only
- [ ] `lib/api.ts` uses `cookies()` — server-only, with `query` support
- [ ] `ApiError` class in `api.ts` (not separate file), with `extractMessage` matching backend error format
- [ ] Server Components load data with **graceful error handling** (catch non-401, show empty state)
- [ ] Server Actions handle mutations (deposit, transfer, login, register, logout)
- [ ] **Frontend action URLs exactly match backend controller routes** (verify every path)
- [ ] Forms use `useActionState` pattern
- [ ] Deposit action: `revalidatePath` + `redirect('/dashboard')`
- [ ] Wire action: `revalidatePath` + return null (success detected via `useEffect`)
- [ ] Send-form: `useEffect + hasSubmitted` pattern for success detection (NO stale closure)
- [ ] History uses URL searchParams for pagination and type filter, `query` option in api()
- [ ] User search via server action (for send form)
- [ ] httpOnly cookie with `secure` in production
- [ ] Dashboard layout auth guard (redirect to /login)
- [ ] Cookie `maxAge` matches `JWT_EXPIRES_IN`
- [ ] Landing page visually unique
- [ ] Dashboard layout unique
- [ ] Unique fonts, colors, terminology
- [ ] SVG logo + favicon in `public/`
- [ ] Favicon reference in layout.tsx metadata
- [ ] `.dockerignore` in web dir (`node_modules`, `.next`, `.env.local`) — prevents Docker build failures
- [ ] Web Dockerfile with `output: 'standalone'` in next.config.ts

**Monorepo:**
- [ ] `@fintech/*` path overrides in tsconfig.json (3 levels up: `../../../packages/<pkg>/dist/index`)
- [ ] Root `package.json` has `pnpm.onlyBuiltDependencies` for bcrypt/prisma
- [ ] `.env.local` created for web app (not just `.env.example`)
- [ ] `.env` created for api with real PAYMENT_API_KEY from `apps/payment-service/.env`
- [ ] `pnpm install` succeeds
- [ ] `prisma generate` succeeds (from api dir)
- [ ] `tsc --noEmit` compiles without errors (both api and web)
- [ ] Database in `docker/postgres/init.sql`
- [ ] `platforms/<slug>/docker-compose.yml` with Caddy labels
- [ ] `docs/client-registry.md` updated
- [ ] No `any`, strict mode

**Deploy (MANDATORY — task is NOT complete without this):**
- [ ] `docker compose build` succeeds
- [ ] `docker compose up -d` — containers running
- [ ] `http://<slug>.localhost` returns 200
- [ ] `http://<slug>.localhost/api/docs` returns 200 (Swagger)
- [ ] Return site URL and Swagger URL to user
