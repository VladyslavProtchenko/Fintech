# Client Platform — Technical Reference

> Code patterns, schemas, and configurations for white-label payment platforms. This document is a **reference** — for workflow and generation steps, see the skills in `.claude/skills/`.

## Skills Reference

- `platform-research` — market research, brand strategy, uniqueness check
- `platform-design` — SVG logo/favicon, color palette, fonts
- `platform-api` — NestJS backend generation (invariants in `platform-api/references/`)
- `platform-web` — Next.js frontend generation (invariants in `platform-web/references/`)
- `platform-deploy` — Docker, compilation, deployment
- `platform-test` — E2E testing on deployed site
- `create-client-platform` — orchestrator (runs all 5 in sequence)

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
- **Platform isolation via `platformId`** — payment-service uses `@@unique([email, platformId])` on Client. Same email can register on different platforms, each gets a separate wallet
- **All operations are synchronous** — no queues, no PENDING state. Every operation returns final status immediately

---

## 2. Functional Requirements

### 2.1 Pages

| Page | Auth | Description |
|------|------|-------------|
| `/` | No | Landing page — product description, CTA to login/register |
| `/login` | No | Email + password form |
| `/register` | No | Email + name + password form |
| `/dashboard` | Yes | Balance display, quick actions (deposit, send), recent transactions |
| `/deposit` | Yes | Amount input → confirm → balance increases instantly |
| `/send` | Yes | Email input → search user → amount input → confirm → transfer |
| `/history` | Yes | Full paginated transaction list with type filters |

### 2.2 User Flows

**Registration (lazy provisioning):**
1. User fills email + name + password
2. Backend creates LOCAL User only (passwordHash) — NO payment-service call
3. Returns JWT → set cookie → redirect to `/dashboard`
4. Payment-service client + wallet created lazily on first wallet access

**Login:**
1. Email + password → verify → JWT → cookie → redirect to `/dashboard`

**Deposit:**
1. User enters amount
2. Server Action → backend → `ensurePaymentClient()` → `paymentClient.topup(...)` → COMPLETED
3. `revalidatePath('/dashboard')` + `revalidatePath('/history')` → `redirect('/dashboard')`

**Send money:**
1. User types recipient email → `searchUser` server action → show name
2. Enter amount → confirm
3. Server Action → backend → `ensurePaymentClient()` → `paymentClient.transfer(...)` → COMPLETED
4. `revalidatePath('/dashboard')` → return null
5. Send-form detects success via `useEffect` + `hasSubmitted` → shows success screen

**Transaction history:**
1. Server Component loads paginated list via searchParams
2. Filter by type, paginate via URL params
3. Each row: direction, amount, date, counterparty name

### 2.3 What's NOT Included

- No withdraw/cashout, no real payment gateway, no KYC
- No email notifications, no admin panel, no multi-currency
- No real-time updates

---

## 3. Backend Code Patterns

### 3.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | NestJS (strict TS, tsc build) | 11.x |
| ORM | Prisma (custom output `src/generated/prisma`) | 7.x |
| DB driver | @prisma/adapter-pg + pg | 7.x |
| Auth | JWT + Passport via `@fintech/shared-auth` | passport-jwt 4.x |
| Validation | class-validator + class-transformer | latest |
| Config | @nestjs/config + `@fintech/shared-config` | latest |
| Health | @nestjs/terminus (local HealthModule) | latest |

### 3.2 Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"  # MUST be inside src/
}

datasource db {
  provider = "postgresql"
  # NO url here — Prisma 7 uses prisma.config.ts
}

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  passwordHash    String
  name            String
  paymentClientId String?  @unique  // lazy — created on first wallet access
  walletId        String?  @unique  // cached for counterparty lookups
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**Why `walletId`?** SDK Transaction returns `fromWalletId`/`toWalletId`. To determine direction and resolve counterparty names, the bridge matches walletIds to local users.

### 3.3 Prisma 7 Configuration

```typescript
// prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
```

### 3.4 PrismaService (shared mixin)

```typescript
import { Injectable } from '@nestjs/common';
import { withPrismaAdapterPg } from '@fintech/shared-prisma';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends withPrismaAdapterPg(PrismaClient) {}
```

### 3.5 Auth Flow

```typescript
// auth.module.ts — MUST import JwtModule directly
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

Registration: `hashPassword` from `@fintech/shared-auth` → save User → JWT.
Login: `comparePassword` from `@fintech/shared-auth` → JWT.
JWT Payload: `{ sub: userId, email }` — `JwtPayload` from `@fintech/shared-auth`.

### 3.6 Payment Bridge

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

  /** Lazily creates payment-service client + wallet on first wallet access */
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

    if (type === 'sent' || type === 'received') {
      items = items.filter(tx => tx.type === type);
    }

    return { items, total: result.total, page: result.page, limit: result.limit };
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
      sum: tx.amount,        // field name varies per client
      status: tx.status.toLowerCase(),
      counterparty: counterpartyWalletId && nameMap ? (nameMap.get(counterpartyWalletId) ?? null) : null,
      createdAt: tx.createdAt,
    };
  }
}
```

### 3.7 Transaction Mapping

```typescript
// SDK returns:
{ id, fromWalletId, toWalletId, amount, type, status, idempotencyKey, createdAt }

// Bridge returns to frontend:
interface MappedTransaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  sum: string;             // field name varies per client (amount/sum/value)
  status: string;
  counterparty: string | null;
  createdAt: string;
}
```

Direction logic:
- `type === 'TOPUP'` → `deposit`
- `type === 'TRANSFER'` + `fromWalletId === myWalletId` → `sent`
- `type === 'TRANSFER'` + `toWalletId === myWalletId` → `received`

### 3.8 GlobalExceptionFilter

Handles THREE sources of errors:

```typescript
import { PaymentServiceError } from '@fintech/payment-sdk';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      // format to client's unique error style
      return;
    }

    if (exception instanceof PaymentServiceError) {
      const status = exception.isInsufficientFunds
        ? HttpStatus.UNPROCESSABLE_ENTITY   // 422
        : HttpStatus.BAD_GATEWAY;           // 502
      // format to client's error style with exception.message
      return;
    }

    console.error('Unhandled exception:', exception);
    // return 500 with generic message
  }
}
```

### 3.9 User Search Endpoint

```
GET /<path>/search?email=john@example.com
→ { found: true, name: "John Doe" }
→ { found: false }
```

Protected by JWT. Returns only `found` + `name` — no IDs, no balance.

### 3.10 Endpoint Naming Examples

| Operation | Style A | Style B | Style C | Style D |
|-----------|---------|---------|---------|---------|
| Register | `POST /auth/register` | `POST /signup` | `POST /api/users` | `POST /v1/account/create` |
| Login | `POST /auth/login` | `POST /signin` | `POST /api/sessions` | `POST /v1/account/login` |
| Balance | `GET /wallet/balance` | `GET /account/funds` | `GET /api/balance` | `GET /v1/wallet` |
| Deposit | `POST /wallet/deposit` | `POST /funds/add` | `POST /api/deposit` | `POST /v1/wallet/fund` |
| Transfer | `POST /wallet/transfer` | `POST /funds/send` | `POST /api/send` | `POST /v1/wallet/send` |
| Search | `GET /users/search` | `GET /members/find` | `GET /api/users/lookup` | `GET /v1/recipients/check` |
| History | `GET /wallet/history` | `GET /funds/activity` | `GET /api/transactions` | `GET /v1/wallet/ledger` |
| Health | `GET /health` | `GET /health` | `GET /health` | `GET /health` |

### 3.11 Error Format Examples

**Style A** (nested): `{ "error": { "type": "VALIDATION_ERROR", "detail": "...", "status": 400 } }`
**Style B** (flat): `{ "code": "validation_failed", "message": "...", "statusCode": 400 }`
**Style C** (API): `{ "success": false, "error": { "code": "ERR_VALIDATION", "message": "..." } }`
**Style D** (verbose): `{ "ok": false, "errors": [{ "field": "amount", "reason": "Required" }] }`

### 3.12 Environment Variables

```env
NODE_ENV=development
PORT=<unique>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/<slug>_db
JWT_SECRET=<random 32+ chars>
JWT_EXPIRES_IN=7d
PAYMENT_API_URL=http://localhost:3004
PAYMENT_API_KEY=<read from apps/payment-service/.env>
PLATFORM_ID=<slug>
FRONTEND_URL=http://localhost:<web-port>
```

### 3.13 main.ts Bootstrap

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
}));
app.enableCors({ origin: configService.get('FRONTEND_URL'), credentials: true });
app.useGlobalFilters(new GlobalExceptionFilter());

// Swagger path must be 'docs' — Caddy strips /api/, public URL = /api/docs
SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
```

### 3.14 API Dockerfile

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

---

## 4. Frontend Code Patterns

### 4.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Server Components + Server Actions) | 15.x |
| Styling | Tailwind CSS (CSS-first @theme) | 4.x |
| Auth | JWT in httpOnly cookie | — |

No TanStack Query, no Zustand. Server Components for reads, Server Actions for writes.

### 4.2 API Client (`lib/api.ts`)

```typescript
import { cookies } from 'next/headers';

const API_URL = process.env['API_URL']!;

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(ApiError.extractMessage(body));
    this.name = 'ApiError';
  }
  get isUnauthorized() { return this.status === 401; }

  private static extractMessage(body: unknown): string {
    // Adapt parsing to match this platform's backend error format
    if (typeof body !== 'object' || body === null) return 'Request failed';
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
    const error = await res.json().catch(() => null);
    throw new ApiError(res.status, error);
  }

  return res.json() as Promise<T>;
}
```

### 4.3 Auth Flow

```typescript
// Server action — set cookie after login/register
const cookieStore = await cookies();
cookieStore.set('token', jwt, {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
});
redirect('/dashboard');
```

Dashboard layout auth guard:
```typescript
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');
  if (!token) redirect('/login');
  return <Shell>{children}</Shell>;
}
```

### 4.4 Server Component — Graceful Error Handling

```typescript
export default async function DashboardPage() {
  let balance = '0.00';
  let transactions: MappedTransaction[] = [];

  try {
    const data = await api<WalletResponse>('/wallet');
    balance = data.balance;
    transactions = data.recentTransactions ?? [];
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    // Non-401: show empty state, don't crash
  }

  return <Dashboard balance={balance} transactions={transactions} />;
}
```

### 4.5 Send Form — Success Detection Pattern

```tsx
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

**DO NOT check `sendError` inside the action wrapper** — stale closure bug.

### 4.6 History — URL SearchParams Pagination

```typescript
export default async function HistoryPage({
  searchParams,
}: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const params = await searchParams;
  const data = await api<TransactionsResponse>('/wallet/transactions', {
    query: {
      page: params.page ?? '1',
      ...(params.type ? { type: params.type } : {}),
    },
  });
  return <TransactionList data={data} />;
}
```

### 4.7 Web Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE <webPort>
CMD ["node", "server.js"]
```

Requires `output: 'standalone'` in `next.config.ts`.

Requires `.dockerignore` in web directory:
```
node_modules
.next
.env.local
```

---

## 5. Monorepo Configuration

### 5.1 Location

```
platforms/
  <slug>/
    api/                 # NestJS backend
    web/                 # Next.js frontend
    docker-compose.yml
packages/
  payment-sdk/           # SDK for payment-service
  shared-auth/           # createAuthModule, JwtAuthGuard, CurrentUser, hash/compare
  shared-prisma/         # withPrismaAdapterPg mixin
  shared-health/         # createHealthModule factory
  shared-config/         # BaseEnvironmentVariables, createValidator
```

### 5.2 Backend tsconfig.json

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

**Why `dist/index`?** Base tsconfig points to source. TypeScript would include SDK source in compilation, expanding rootDir. Pointing to `dist/index` reads only `.d.ts` files.

**Why `incremental: false`?** With `deleteOutDir: true`, incremental causes stale `.tsbuildinfo`.

### 5.3 Backend package.json

```json
{
  "name": "@fintech/<slug>-api",
  "scripts": {
    "build": "nest build",
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

Note: `bcrypt` NOT needed — `@fintech/shared-auth` provides hash/compare.

### 5.4 Frontend package.json

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

### 5.5 nest-cli.json

```json
{
  "sourceRoot": "src",
  "entryFile": "main",
  "compilerOptions": { "deleteOutDir": true }
}
```

tsc builder (NOT SWC).

### 5.6 pnpm v10

Root `package.json` must have:
```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["bcrypt", "@nestjs/core", "prisma", "unrs-resolver"]
  }
}
```

### 5.7 docker-compose.yml

```yaml
name: <slug>

services:
  <slug>-api:
    build:
      context: ../../
      dockerfile: platforms/<slug>/api/Dockerfile
    container_name: <slug>-api
    environment:
      NODE_ENV: development
      PORT: <apiPort>
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/<slug>_db
      JWT_SECRET: <slug>-dev-secret-32chars-minimum-required
      JWT_EXPIRES_IN: 7d
      PAYMENT_API_URL: http://payment-service:3004
      PAYMENT_API_KEY: <from payment-service .env>
      PLATFORM_ID: <slug>
      FRONTEND_URL: http://<slug>.localhost
    networks: [caddy, internal]
    labels:
      caddy: "http://<slug>.localhost"
      caddy.handle_path: /api/*
      caddy.handle_path.0_reverse_proxy: "{{upstreams <apiPort>}}"

  <slug>-web:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: <slug>-web
    environment:
      API_URL: http://<slug>-api:<apiPort>
      NEXT_PUBLIC_APP_NAME: <displayName>
      NEXT_PUBLIC_APP_URL: http://<slug>.localhost
    networks: [caddy, internal]
    labels:
      caddy: "http://<slug>.localhost"
      caddy.handle.0_reverse_proxy: "{{upstreams <webPort>}}"
    depends_on: [<slug>-api]

networks:
  caddy:
    external: true
  internal:
    driver: bridge
```
