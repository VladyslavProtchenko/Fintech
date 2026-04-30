# Client Platform Specification

> How to generate a unique client project (backend + frontend) that uses `@fintech/payment-sdk` to communicate with the shared payment core.

## Overview

Each client gets two independent apps:

- **`<client>-api`** — NestJS 11 backend (auth, business logic, payment-sdk bridge)
- **`<client>-web`** — Next.js 16 frontend (landing + auth + dashboard)

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

**Registration:**
1. User fills email + name + password
2. Backend creates payment client (via SDK), then local User
3. Returns JWT → set cookie → redirect to `/dashboard`

**Login:**
1. Email + password → verify → JWT → cookie → redirect to `/dashboard`

**Deposit (prototype — no real payment gateway):**
1. User enters any amount (e.g., "500.00")
2. Confirm button
3. Server Action calls backend → backend calls `paymentClient.topup(...)` → returns COMPLETED
4. `revalidatePath('/dashboard')` → page re-renders with new balance
5. Show success message

**Send money:**
1. User types recipient email
2. Client component calls `searchUser` server action
3. If found — show recipient name, enter amount
4. Confirm → Server Action calls backend → `paymentClient.transfer(...)` → returns COMPLETED
5. `revalidatePath('/dashboard')` → show result (success / insufficient funds)

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

## 3. Backend (`<client>-api`)

### 3.1 Tech Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | NestJS (strict TS, tsc build) | 11.x |
| ORM | Prisma (custom output `src/generated/prisma`) | 7.x |
| DB driver | @prisma/adapter-pg + pg (driver-based) | 7.x |
| Auth | JWT + Passport + bcrypt | passport-jwt 4.x |
| Validation | class-validator + class-transformer | latest |
| Config | @nestjs/config + class-validator env schema | latest |
| Health | @nestjs/terminus → `GET /health` | latest |

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
  paymentClientId String   @unique  // maps to Client.id in payment-service
  walletId        String   @unique  // cached from payment-service for fast counterparty lookups
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Why `walletId`?** SDK `Transaction` returns `fromWalletId`/`toWalletId`. To determine direction (sent/received) and resolve counterparty names, the bridge needs to match walletIds to local users. Storing `walletId` avoids extra SDK calls.

**Registration order** (critical for atomicity):

1. Call `paymentClient.createClient({ email, name, platformId })` — get back `{ id, wallet: { id: walletId } }` from payment-service
2. Create `User` locally with `paymentClientId = client.id` and `walletId = client.wallet.id`
3. If step 2 fails — orphaned client in payment-service is acceptable (zero balance, no data)

If `createClient` throws 409 (duplicate email+platformId in payment-service) — return "email already in use".

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

#### PrismaService (driver-based adapter)

Prisma 7 requires a driver-based connection. Use `@prisma/adapter-pg` with `pg.Pool`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
```

**Do NOT use `datasourceUrl` in PrismaClient constructor** — Prisma 7 removed it. The adapter pattern is the only way.

### 3.4 Project Structure

```
<client>-api/
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
      env.validation.ts        # PORT, DATABASE_URL, JWT_SECRET, PAYMENT_API_URL, PAYMENT_API_KEY, PLATFORM_ID
    prisma/
      prisma.module.ts         # global module
      prisma.service.ts
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts          # register + login
      jwt.strategy.ts
      guards/
        jwt-auth.guard.ts
      decorators/
        current-user.decorator.ts
      dto/
        register.dto.ts
        login.dto.ts
      types/
        jwt-payload.ts
    payment/                   # name varies per client (wallet/, funds/, account/)
      payment.module.ts
      payment.service.ts       # wraps PaymentClient + maps responses
      payment.controller.ts
      dto/
        deposit.dto.ts
        transfer.dto.ts
    user/                      # user lookup for transfers
      user.module.ts
      user.service.ts          # findByEmail (for transfer recipient search)
      user.controller.ts       # GET /users/search?email=...
    health/
      health.module.ts
      health.controller.ts
    common/
      filters/
        global-exception.filter.ts
  test/
    app.e2e-spec.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
  Dockerfile
```

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

// Swagger (dev only)
if (process.env.NODE_ENV !== 'production') { ... }
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

1. **Register**: call `paymentClient.createClient({ email, name, platformId })` → hash password (bcrypt, 12 rounds) → save User (with `paymentClientId` + `walletId`) → return JWT
2. **Login**: find by email → verify bcrypt → return JWT
3. **JWT Payload**: `{ sub: userId, email: string }`
4. **Protected routes**: `@UseGuards(JwtAuthGuard)` + `@CurrentUser()` decorator

### 3.8 Payment Bridge + Response Mapping

The payment bridge wraps `PaymentClient` and **maps all responses** to hide payment-service internals.

**Getting balance** — SDK has no `getBalance()`. Use `getClient(paymentClientId)` → extract `client.wallet.balance`:

```typescript
async getBalance(userId: string): Promise<string> {
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const client = await this.client.getClient(user.paymentClientId);
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
  amount: string;
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
For transfers, the bridge knows the counterparty's `walletId`. It needs to resolve: `walletId` → `clientId` (via `getClient` or cached) → `paymentClientId` → local `User.name`. For the prototype, a simple approach:
1. Get current user's `paymentClientId` → call `getClient()` → get `wallet.id` (cache per request)
2. For each transfer transaction, the other walletId belongs to the counterparty
3. Look up counterparty: find local User by iterating or via a prebuilt map

**Simplified approach for prototype:** `walletId` is already stored on the User model (see section 3.2). Counterparty lookup is just `prisma.user.findUnique({ where: { walletId } })`.

**`MappedTransaction` interface** (defined in the payment module):

```typescript
interface MappedTransaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  amount: string;
  status: string;
  counterparty: string | null;  // name, null for deposits
  createdAt: string;
}
```

**Full bridge:**

```typescript
@Injectable()
export class PaymentService {
  private readonly client: PaymentClient;

  // NOTE: `platformId` is NOT needed here — it's used in auth.service during registration
  // (createClient call). The bridge only works with existing paymentClientIds.

  constructor(config: ConfigService, private prisma: PrismaService) {
    this.client = new PaymentClient({
      baseUrl: config.getOrThrow('PAYMENT_API_URL'),
      apiKey: config.getOrThrow('PAYMENT_API_KEY'),
    });
  }

  async getBalance(userId: string): Promise<string> {
    const user = await this.findUser(userId);
    const client = await this.client.getClient(user.paymentClientId);
    return client.wallet?.balance ?? '0';
  }

  async deposit(userId: string, amount: string): Promise<MappedTransaction> {
    const user = await this.findUser(userId);
    const tx = await this.client.topup({
      clientId: user.paymentClientId,
      amount,
      idempotencyKey: crypto.randomUUID(),
    });
    return this.mapTransaction(tx, user.walletId);
  }

  async transfer(userId: string, toEmail: string, amount: string): Promise<MappedTransaction> {
    const [sender, recipient] = await Promise.all([
      this.findUser(userId),
      this.prisma.user.findUnique({ where: { email: toEmail } }),
    ]);
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (sender.id === recipient.id) throw new BadRequestException('Cannot transfer to yourself');

    const tx = await this.client.transfer({
      fromClientId: sender.paymentClientId,
      toClientId: recipient.paymentClientId,
      amount,
      idempotencyKey: crypto.randomUUID(),
    });
    return this.mapTransaction(tx, sender.walletId);
  }

  async listTransactions(userId: string, page?: number, limit?: number, type?: string) {
    const user = await this.findUser(userId);

    // SDK accepts TxType ('TOPUP' | 'TRANSFER' | 'WITHDRAWAL'), not our mapped types.
    // Map client-facing filter to SDK filter:
    //   'deposit'  → SDK type 'TOPUP'
    //   'sent'     → SDK type 'TRANSFER' (then post-filter by direction)
    //   'received' → SDK type 'TRANSFER' (then post-filter by direction)
    //   undefined  → no filter
    let sdkType: 'TOPUP' | 'TRANSFER' | undefined;
    if (type === 'deposit') sdkType = 'TOPUP';
    if (type === 'sent' || type === 'received') sdkType = 'TRANSFER';

    const result = await this.client.listTransactions({
      clientId: user.paymentClientId,
      page,
      limit,
      type: sdkType,
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

    let items = result.items.map(tx => this.mapTransaction(tx, user.walletId, nameMap));

    // Post-filter 'sent' vs 'received' (both are SDK type TRANSFER)
    if (type === 'sent' || type === 'received') {
      items = items.filter(tx => tx.type === type);
    }

    return { items, total: result.total, page: result.page, limit: result.limit };
  }

  // NOTE: When filtering by 'sent' or 'received', the `total` from SDK reflects all TRANSFER
  // transactions (both directions). For the prototype this is acceptable — pagination may show
  // fewer items than `limit` on some pages. A production fix would add direction-aware counting
  // in payment-service itself.

  private mapTransaction(tx: Transaction, myWalletId: string, nameMap?: Map<string, string>): MappedTransaction {
    let type: 'deposit' | 'sent' | 'received';
    let counterpartyWalletId: string | null = null;

    if (tx.type === 'TOPUP') {
      type = 'deposit';
    } else if (tx.fromWalletId === myWalletId) {
      type = 'sent';
      counterpartyWalletId = tx.toWalletId;
    } else {
      type = 'received';
      counterpartyWalletId = tx.fromWalletId;
    }

    return {
      id: tx.id,
      type,
      amount: tx.amount,
      status: tx.status.toLowerCase(),
      counterparty: counterpartyWalletId && nameMap ? nameMap.get(counterpartyWalletId) ?? null : null,
      createdAt: tx.createdAt,
    };
  }

  private async findUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }
}
```

### 3.9 User Search Endpoint

For the "send money" flow, frontend needs to check if recipient exists:

```
GET /users/search?email=john@example.com
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

`GlobalExceptionFilter` handles two sources of errors:
1. **NestJS `HttpException`** (from `ValidationPipe`, guards, own throws) — contains `message` string or `message[]` array. For field-level error styles (like Style D), parse `ValidationPipe`'s array of messages into `{ field, reason }` pairs.
2. **`PaymentServiceError`** (from SDK, caught in payment bridge, re-thrown as NestJS exception) — contains single `message` string. Map to the client's error format as a general error, not field-level.

Never leak payment-service error structure (codes, traceId, original format).

### 3.12 Environment Variables

```env
NODE_ENV=development
PORT=<unique, e.g. 3010>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<client>_db
JWT_SECRET=<random 32+ chars>
JWT_EXPIRES_IN=7d
PAYMENT_API_URL=http://localhost:3004
PAYMENT_API_KEY=<read from apps/payment-service/.env — NEVER guess this value>
PLATFORM_ID=<client slug, e.g. "acme">
FRONTEND_URL=http://localhost:<web-port>
```

**IMPORTANT:** Before writing `.env`, read actual values from:
- `PAYMENT_API_KEY` → `apps/payment-service/.env` (field `API_KEY`)
- `DATABASE_URL` format → any existing client's `.env` (e.g. `apps/greenapple-api/.env`) — the username/password may differ from `postgres:postgres` in local dev

All validated at startup via class-validator. App crashes on missing required vars.

### 3.13 Endpoint Naming (Unique Per Client)

| Operation | Style A | Style B | Style C | Style D |
|-----------|---------|---------|---------|---------|
| Register | `POST /auth/register` | `POST /signup` | `POST /api/users` | `POST /v1/account/create` |
| Login | `POST /auth/login` | `POST /signin` | `POST /api/sessions` | `POST /v1/account/login` |
| Balance | `GET /wallet/balance` | `GET /account/funds` | `GET /api/balance` | `GET /v1/wallet` |
| Deposit | `POST /wallet/deposit` | `POST /funds/add` | `POST /api/deposit` | `POST /v1/wallet/fund` |
| Transfer | `POST /wallet/transfer` | `POST /funds/send` | `POST /api/send` | `POST /v1/payments/send` |
| Search user | `GET /users/search` | `GET /members/find` | `GET /api/users/lookup` | `GET /v1/recipients/check` |
| History | `GET /wallet/history` | `GET /funds/activity` | `GET /api/transactions` | `GET /v1/payments/history` |
| Health | `GET /health` | `GET /health` | `GET /health` | `GET /health` |

### 3.14 Dockerfile

Multi-stage build:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY apps/<client>-api ./apps/<client>-api
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@fintech/<client>-api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/<client>-api/dist ./dist
COPY --from=builder /app/apps/<client>-api/prisma ./prisma
COPY --from=builder /app/apps/<client>-api/prisma.config.ts ./
COPY --from=builder /app/apps/<client>-api/package.json ./
COPY --from=builder /app/apps/<client>-api/node_modules ./node_modules
COPY --from=builder /app/apps/<client>-api/generated ./generated
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

---

## 4. Frontend (`<client>-web`)

### 4.1 Tech Stack & Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Server Components + Server Actions) | 15.x or 16.x |
| Styling | Tailwind CSS | 4.x |
| HTTP | Native fetch (server-side only) | — |
| Auth | JWT in httpOnly cookie | — |

No TanStack Query, no Zustand, no client-side state management libraries. Next.js 16 Server Components handle data loading, Server Actions handle mutations. Only forms are `'use client'`.

### 4.2 Project Structure

```
<client>-web/
  src/
    app/
      layout.tsx               # root: fonts, metadata, global styles
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
      api.ts                    # server-side fetch wrapper for <client>-api
    components/
      ui/                       # button, input, card, badge, modal
      layout/                   # header, sidebar, nav, footer
      dashboard/
        balance-card.tsx        # SC
        recent-transactions.tsx # SC
        quick-actions.tsx       # SC
      forms/
        login-form.tsx          # 'use client' — form with useActionState
        register-form.tsx       # 'use client'
        deposit-form.tsx        # 'use client'
        send-form.tsx           # 'use client' — email search + amount + confirm
    actions/
      auth.ts                   # server actions: login, register, logout
      payment.ts                # server actions: deposit, transfer
      user.ts                   # server action: searchUser (for send form)
  public/
  tailwind.config.ts
  next.config.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
```

### 4.3 Data Flow Pattern

**Reading data (Server Components):**
```
page.tsx (Server Component)
  → reads cookie via cookies()
  → calls api() with token
  → renders HTML with data
  → no loading spinners, no client JS
```

**Mutations (Server Actions):**
```
form (Client Component with useActionState)
  → calls server action
  → server action calls api() with token from cookie
  → on success: revalidatePath('/dashboard') + return success state
  → on error: return error state (displayed in form)
```

**User search (interactive, from client):**
```
send-form.tsx ('use client')
  → calls searchUser server action on email input blur/submit
  → server action calls api() → returns { found, name } or { found: false }
  → form shows recipient name or "not found"
```

### 4.4 API Client (`lib/api.ts`)

Server-side only fetch wrapper:

```typescript
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL!;

export async function api<T>(path: string, options: {
  method?: string;
  body?: unknown;
} = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(res.status, error);
  }

  return res.json() as Promise<T>;
}
```

`ApiError` class (defined in the same file or separate `lib/errors.ts`):

```typescript
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(typeof body === 'object' && body && 'message' in body
      ? String((body as Record<string, unknown>).message)
      : 'Request failed');
  }
}
```

Used only in Server Components and Server Actions — never imported from `'use client'` files.

### 4.5 Auth Flow

1. User submits login/register form → server action calls backend
2. Backend returns JWT → server action sets httpOnly cookie:
   ```typescript
   const cookieStore = await cookies();
   cookieStore.set('token', jwt, {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'lax',
     path: '/',
     maxAge: 60 * 60 * 24 * 7, // 7 days
   });
   redirect('/dashboard');
   ```
3. Dashboard layout reads cookie — if missing → `redirect('/login')`
4. Logout → server action deletes cookie → redirect to login

### 4.6 Pages Detail

**Landing (`/`):**
- Hero section with product name + tagline
- 3-4 feature cards (fast transfers, secure, etc.)
- CTA buttons: "Get Started" → `/register`, "Sign In" → `/login`
- Footer with minimal links
- Fully static Server Component

**Dashboard (`/dashboard`):**
- Server Component loads balance + last 5 transactions on render
- Balance card (large number, USD)
- Quick action buttons: "Deposit" and "Send Money" (links to `/deposit`, `/send`)
- Recent transactions list (links to `/history`)

**Deposit (`/deposit`):**
- `deposit-form.tsx` (`'use client'`) with `useActionState`
- Amount input (number)
- "Confirm" button
- Server action: calls backend deposit → `revalidatePath('/dashboard')` → return success/error
- On success: show new balance + "Back to Dashboard" link

**Send (`/send`):**
- `send-form.tsx` (`'use client'`) — multi-step form:
  - Step 1: email input → blur/button triggers `searchUser` server action → shows name or "not found"
  - Step 2: amount input (only visible if user found)
  - Step 3: confirm (shows summary: recipient + amount)
- Server action: calls backend transfer → `revalidatePath('/dashboard')` → return result
- Shows final status (success / insufficient funds / error)

**History (`/history`):**
- Server Component reads `searchParams` for page and type filter
- Calls backend with params → renders list
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
  - "Send Money" vs "Transfer Funds" vs "Pay Someone" vs "Move Money"
  - "Deposit" vs "Add Funds" vs "Top Up" vs "Load Balance"
  - "Balance" vs "Available Funds" vs "Account Total" vs "Your Money"
- **Landing page style**: hero-centered / hero-split / hero-gradient / minimal
- **Transaction display**: table / card list / timeline
- **Brand**: unique name, tagline, placeholder logo text

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
apps/
  <client>-api/
  <client>-web/
packages/
  payment-sdk/         # already exists
```

### 5.2 tsconfig.base.json

`@fintech/payment-sdk` path alias is already configured:

```json
"@fintech/payment-sdk": ["${configDir}/packages/payment-sdk/src/index.ts"]
```

### 5.3 Backend Dependencies

```json
{
  "name": "@fintech/<client>-api",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "prisma generate && nest start --watch",
    "start:prod": "node dist/main",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:migrate:prod": "prisma migrate deploy"
  },
  "dependencies": {
    "@fintech/payment-sdk": "workspace:*",
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/swagger": "^11.0.0",
    "@nestjs/terminus": "^11.0.0",
    "@prisma/adapter-pg": "^7.0.0",
    "@prisma/client": "^7.0.0",
    "pg": "^8.0.0",
    "bcrypt": "^5.1.0",
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
    "@types/bcrypt": "^5.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.0.0",
    "@types/passport-jwt": "^4.0.0",
    "prisma": "^7.0.0",
    "typescript": "^5.7.0"
  }
}
```

### 5.4 Frontend Dependencies

```json
{
  "name": "@fintech/<client>-web",
  "dependencies": {
    "next": "^16.0.0",
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

**Critical:** Override `incremental: false` (prevents tsbuildinfo caching issues with `deleteOutDir`), set `rootDir: "./src"`, and override `@fintech/payment-sdk` path to point at compiled `dist/index` (not source `.ts` — that expands rootDir beyond `src/`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": false,
    "baseUrl": "./",
    "paths": {
      "@fintech/payment-sdk": ["../../packages/payment-sdk/dist/index"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Why `dist/index` in paths?** The base tsconfig points to `packages/payment-sdk/src/index.ts`. When TypeScript resolves this, it includes SDK source in compilation, expanding `rootDir` to the workspace root. Pointing to `dist/index` makes TypeScript read only `.d.ts` files (type declarations) without including them in compilation.

**Why `incremental: false`?** The base tsconfig has `incremental: true`. Combined with `deleteOutDir: true` in nest-cli.json, this causes `nest start --watch` to delete dist but the stale `.tsbuildinfo` file thinks nothing changed, so tsc skips emission. Disabling incremental avoids this issue.

### 5.6 pnpm v10 Native Dependencies

pnpm v10 blocks native build scripts by default. For packages like `bcrypt` and `prisma`, the root `package.json` must include:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["bcrypt", "@nestjs/core", "prisma", "unrs-resolver"]
  }
}
```

Check if these entries already exist before adding — don't duplicate.

### 5.7 Frontend .env.local

Create `.env.local` immediately (not just `.env.example`):

```env
NEXT_PUBLIC_APP_URL=http://localhost:<web-port>
API_URL=http://localhost:<api-port>
```

This file is gitignored but needed for `pnpm dev` to work.

### 5.8 Docker

```yaml
<client>-api:
  build:
    context: .
    dockerfile: apps/<client>-api/Dockerfile
  ports:
    - "<api-port>:3000"
  environment:
    - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/<client>_db
    - JWT_SECRET=${<CLIENT>_JWT_SECRET}
    - PAYMENT_API_URL=http://payment-service:3004
    - PAYMENT_API_KEY=${PAYMENT_API_KEY}
    - PLATFORM_ID=<client-slug>
    - FRONTEND_URL=http://localhost:<web-port>
  depends_on:
    - postgres
    - payment-service

<client>-web:
  build:
    context: .
    dockerfile: apps/<client>-web/Dockerfile
  ports:
    - "<web-port>:3000"
  environment:
    - API_URL=http://<client>-api:3000
    - NEXT_PUBLIC_APP_NAME=<Client Display Name>
  depends_on:
    - <client>-api
```

### 5.9 Database

Add to `docker/postgres/init.sql`:
```sql
CREATE DATABASE <client>_db;
```

---

## 6. Generation Rules (for Claude Code skill)

### 6.1 Check Existing Clients

Before generating, scan `apps/` for existing `*-api` and `*-web` dirs. Read `docs/client-registry.md` for used ports, styles, colors. New client must not duplicate any.

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
- NestJS 11 + Prisma 7 conventions
- JWT auth with bcrypt (12 rounds)
- `User` model with `paymentClientId` + `walletId` fields
- Register: create payment client FIRST (with `platformId`), then local User (store `walletId` from response)
- Payment bridge maps SDK `Transaction` → client-friendly format (hide walletIds, add direction + counterparty name)
- Balance fetched via `getClient()` → `wallet.balance`
- `ValidationPipe` with whitelist + forbidNonWhitelisted
- `GlobalExceptionFilter` catching `PaymentServiceError` and re-mapping
- Never expose payment-service details to frontend
- `GET /health` (public)
- Env validation at startup (crash on missing)
- CORS for frontend origin
- Swagger in dev mode
- Strict TS, no `any`
- Frontend: Server Components for data, Server Actions for mutations
- Frontend: httpOnly cookies for auth
- Frontend: `lib/api.ts` is server-side only (uses `cookies()`)
- Frontend: forms use `useActionState` pattern
- Frontend: history uses URL searchParams for pagination/filters (no client state)
- Idempotency keys generated by backend as UUID v4

### 6.5 Naming Convention

Given slug `acme`:
- Backend: `apps/acme-api/`, package `@fintech/acme-api`
- Frontend: `apps/acme-web/`, package `@fintech/acme-web`
- Database: `acme_db`
- Ports: sequential from 3010 (API 3010, Web 3011; next client 3012/3013; ...)

---

## 7. Client Registry

Track all generated clients in `docs/client-registry.md`:

```markdown
| Slug | API Port | Web Port | Endpoint Style | Error Style | Color Hue | Layout | Status |
|------|----------|----------|----------------|-------------|-----------|--------|--------|
| acme | 3010     | 3011     | /wallet/*      | nested      | 220 (blue)| sidebar-left | active |
| bolt | 3012     | 3013     | /funds/*       | flat        | 150 (green)| top-nav | active |
```

Claude Code skill must read this before generating and update it after.

---

## 8. Generation Checklist

**Backend:**
- [ ] `prisma.config.ts` with `defineConfig`
- [ ] `schema.prisma` — no `url` in datasource
- [ ] Import from `generated/prisma/client`
- [ ] `User` model with `paymentClientId @unique` + `walletId @unique`
- [ ] Registration: payment client first (with `platformId`), then User (store both IDs)
- [ ] `PLATFORM_ID` env var set to client slug
- [ ] 409 duplicate email+platform handled
- [ ] JWT + Passport + bcrypt auth
- [ ] `@CurrentUser()` decorator
- [ ] Payment bridge: resolves `paymentClientId` from `userId`
- [ ] Balance via `getClient()` → `wallet.balance`
- [ ] Transaction mapping: hides walletIds, adds direction (deposit/sent/received) + counterparty name
- [ ] Transfer: recipient found in LOCAL User table by email
- [ ] Counterparty name resolved via `walletId` → local User lookup
- [ ] User search endpoint: returns only `{ found, name }` — no IDs
- [ ] Idempotency keys as UUID v4 (backend generates)
- [ ] `GlobalExceptionFilter` with unique error format
- [ ] Payment-service IDs/errors never leaked
- [ ] `ValidationPipe` in `main.ts`
- [ ] CORS enabled
- [ ] Swagger (dev)
- [ ] `nest-cli.json` with tsc builder (NOT SWC), `deleteOutDir: true`
- [ ] `tsconfig.json`: `rootDir: "./src"`, `incremental: false`, paths → `dist/index`
- [ ] Prisma output: `../src/generated/prisma` (inside src/)
- [ ] PrismaService uses `@prisma/adapter-pg` + `pg.Pool` (NOT `datasourceUrl`)
- [ ] `start:dev` script: `prisma generate && nest start --watch`
- [ ] Env validation at startup
- [ ] `GET /health` public
- [ ] Dockerfile with multi-stage build
- [ ] `.gitignore` includes `generated/`, `dist/`, `.env`, `src/generated/`

**Frontend:**
- [ ] `API_URL` is server-only
- [ ] `lib/api.ts` uses `cookies()` — never imported from client components
- [ ] Server Components load data (balance, transactions, history)
- [ ] Server Actions handle mutations (deposit, transfer, login, register, logout)
- [ ] Forms use `useActionState` pattern
- [ ] `revalidatePath('/dashboard')` after deposit/transfer
- [ ] History uses URL searchParams for pagination and type filter
- [ ] User search via server action (for send form)
- [ ] httpOnly cookie with `secure` in production
- [ ] Dashboard layout auth guard (redirect to /login)
- [ ] Cookie `maxAge` matches `JWT_EXPIRES_IN`
- [ ] Landing page visually unique
- [ ] Dashboard layout unique
- [ ] Unique fonts, colors, terminology
- [ ] Deposit flow: amount → confirm → success + new balance
- [ ] Send flow: email search → name shown → amount → confirm → result
- [ ] History: paginated, filtered by type, shows direction + counterparty

**Monorepo:**
- [ ] `@fintech/payment-sdk` path alias in `tsconfig.base.json`
- [ ] Root `package.json` has `pnpm.onlyBuiltDependencies` for bcrypt/prisma
- [ ] `.env.local` created for web app (not just `.env.example`)
- [ ] `pnpm install` succeeds
- [ ] `prisma generate` succeeds (from service dir)
- [ ] `tsc` compiles without errors
- [ ] `pnpm dev` starts both API and web successfully
- [ ] Database in `docker/postgres/init.sql`
- [ ] Docker entries in `docker-compose.yml`
- [ ] `docs/client-registry.md` updated
- [ ] No `any`, strict mode

---

## 9. Example: First Client ("acme")

- `apps/acme-api/` — port 3010
- `apps/acme-web/` — port 3011
- Database: `acme_db`

Validates end-to-end flow:
1. Register → creates payment client + user (with walletId) + JWT
2. Login → JWT in cookie
3. Dashboard → shows balance (via getClient) + recent transactions (mapped)
4. Deposit → enter amount → balance increases → dashboard updated
5. Send → find user by email → enter amount → transfer → see result
6. History → all operations with direction, counterparty names, pagination
