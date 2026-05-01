---
name: Create Client Platform
description: >
  This skill should be used when the user asks to "create a client platform",
  "generate a new client", "add a new platform", "create client-api and client-web",
  "scaffold a payment client", or wants to generate a new white-label payment platform
  project (NestJS backend + Next.js frontend) that uses @fintech/payment-sdk.
---

# Create Client Platform

Generate a unique NestJS backend + Next.js frontend pair that communicates with the shared payment-service via `@fintech/payment-sdk`. Every generated project must be structurally and visually distinct from existing clients.

## Prerequisites

Before starting generation, read and follow the full specification:
- **`docs/client-platform-spec.md`** — the authoritative source for architecture, tech stack, data flows, and invariants

## Generation Workflow

### 1. Gather Input

Ask the user for:
- **Client slug** (e.g., `acme`) — used for directory names, package names, database name
- **Display name** (e.g., `Acme Pay`) — shown in UI and metadata

### 2. Check Existing Clients

Read `docs/client-registry.md` to see used slugs, ports, endpoint styles, error styles, color hues, and layout variants. If the registry file does not exist, create it with the header row.

Scan `platforms/` for existing platform directories to confirm used slugs.

Assign the next available port pair (starting from 3014, incrementing by 2 per new platform; greenapple=3010/3011, orange=3012/3013 are taken).

**Also read and save these values NOW (needed for `.env` generation later):**
- `PAYMENT_API_KEY` → read from `apps/payment-service/.env` (field `API_KEY`)
- `DATABASE_URL` format → read from any existing platform's `.env` (e.g. `platforms/orange/api/.env`) — copy the username/host format exactly, only change the DB name

### 3. Choose Unique Traits

Pick traits that do NOT match any existing client:

**Backend traits:**
- Endpoint naming style (e.g., `/wallet/*`, `/funds/*`, `/account/*`, `/v1/payments/*`)
- Error response format (nested, flat, API-style, verbose)
- Module directory name (e.g., `payment/`, `wallet/`, `funds/`, `account/`)
- DTO field variations where possible (`amount` vs `sum` vs `value`)
- Error code naming convention (`VALIDATION_ERROR` vs `validation_failed` vs `ERR_VALIDATION`)

**Frontend traits:**
- Color hue (0-360, must differ by 30+ from existing clients)
- Google Fonts pairing (heading + body font)
- Dashboard layout variant (sidebar-left, sidebar-right, top-nav, minimal)
- Landing page style (hero-centered, hero-split, hero-gradient, minimal)
- Terminology set for actions (deposit, send, balance — all with unique wording)
- Transaction display style (table, card list, timeline)

### 4. Design Logo & Favicon

Before writing any code, design a simple SVG brand identity for the platform.

**Step 1 — Propose 3 icon concepts** (in text, no code yet):
- Each concept: icon shape + rationale tied to platform name/theme
- Example for "nova": A) four-pointed star burst B) stylized letter N with diagonal cut C) small orbit circle

**Step 2 — Pick the strongest concept** (most recognizable at small sizes, works in one color)

**Step 3 — Generate SVG files:**

#### `platforms/<slug>/web/public/logo.svg`
Full logo: icon + wordmark side by side.
- ViewBox: `0 0 160 40`
- Icon on the left (32×32 area), brand name text on the right
- Use the platform's primary color (same hue chosen in step 3)
- Single color fill — no gradients, no shadows, no strokes with varying width
- Font in SVG: use a system font stack or embed a simple geometric path for letters

```svg
<!-- Example structure only — generate actual unique paths per platform -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40">
  <!-- icon group at x=0 -->
  <g transform="translate(4, 4)">
    <!-- unique icon paths here -->
  </g>
  <!-- wordmark -->
  <text x="44" y="26" font-family="system-ui, sans-serif" font-size="18"
        font-weight="700" fill="#HEXCOLOR">PlatformName</text>
</svg>
```

#### `platforms/<slug>/web/public/favicon.svg`
Icon only, no text.
- ViewBox: `0 0 32 32`
- Same icon shape from the logo, centered in 32×32 grid
- Must be readable at 16px display size (avoid thin lines, tiny details)

```svg
<!-- Example structure only -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- same icon, scaled to fill 32x32 with 2px padding -->
</svg>
```

#### favicon reference in layout
In `src/app/layout.tsx`, set metadata to use the SVG favicon:
```ts
export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
};
```

**Logo design rules:**
- One primary color only — use the chosen hue from step 3
- Geometric and abstract — avoid clipart, complex illustrations
- Works at any size from 16px to 200px
- No text inside the icon itself (wordmark is separate)
- Avoid initials-only logos unless the letterform is heavily stylized

### 5. Generate Backend (`platforms/<slug>/api`)

Create `platforms/<slug>/api/` following the spec. Key files in order:

1. `package.json` — workspace deps: `@fintech/payment-sdk`, `@fintech/shared-auth`, `@fintech/shared-prisma`, `@fintech/shared-health`, `@fintech/shared-config` (all `"workspace:*"`). Plus `@prisma/adapter-pg`, `pg`, `dotenv`, `passport`, `@nestjs/jwt`, `@nestjs/passport`, and all NestJS deps. Script `start:dev` must be `prisma generate && nest start --watch`
2. `tsconfig.json` — extends `../../../tsconfig.base.json`, set `rootDir: "./src"`, `incremental: false`, and override ALL @fintech paths → `../../../packages/<pkg>/dist/index` (3 levels up — NOT source):
   - `@fintech/payment-sdk` → `../../../packages/payment-sdk/dist/index`
   - `@fintech/shared-auth` → `../../../packages/shared-auth/dist/index`
   - `@fintech/shared-prisma` → `../../../packages/shared-prisma/dist/index`
   - `@fintech/shared-health` → `../../../packages/shared-health/dist/index`
   - `@fintech/shared-config` → `../../../packages/shared-config/dist/index`
3. `nest-cli.json` — tsc builder (NOT SWC), `deleteOutDir: true`
4. `prisma/schema.prisma` — User model with `paymentClientId` + `walletId` (no `url` in datasource). Output: `../src/generated/prisma` (MUST be inside `src/`)
5. `prisma.config.ts` — `defineConfig` with env DATABASE_URL
6. `.env` — all required vars including `PLATFORM_ID=<slug>` (create real .env for dev, not just .env.example). **IMPORTANT:** Read `PAYMENT_API_KEY` from `apps/payment-service/.env` and `DATABASE_URL` format from an existing platform's `.env` (e.g. `platforms/orange/api/.env`) — do NOT guess these values, copy them from the source of truth.
7. `.gitignore` — `src/generated/`, `generated/`, `dist/`, `node_modules/`, `.env`
8. `src/config/env.validation.ts` — extend `BaseEnvironmentVariables` from `@fintech/shared-config`, add platform-specific fields (JWT_SECRET, PAYMENT_API_URL, PAYMENT_API_KEY, PLATFORM_ID, FRONTEND_URL). Use `createValidator(EnvironmentVariables)` as the `validate` function. Do NOT redefine NODE_ENV, PORT, DATABASE_URL.
9. `src/prisma/` — PrismaModule (global) + PrismaService using `withPrismaAdapterPg(PrismaClient)` mixin from `@fintech/shared-prisma`. PrismaService body is one line: `export class PrismaService extends withPrismaAdapterPg(PrismaClient) {}`
10. `src/auth/` — auth.controller.ts + auth.service.ts + DTOs only. **NO** jwt.strategy.ts, jwt-auth.guard.ts, current-user.decorator.ts, jwt-payload.ts, or auth.module.ts — all provided by `@fintech/shared-auth`. Add `createAuthModule()` directly to `app.module.ts` imports. In auth.service.ts use `hashPassword`/`comparePassword` from `@fintech/shared-auth`; inject `JwtService` from `@nestjs/jwt` for signing. Protect routes with `JwtAuthGuard` and `@CurrentUser()` from `@fintech/shared-auth`.
11. `src/payment/` (or chosen module name) — PaymentService bridge + controller + DTOs
12. `src/user/` (or chosen module name) — user search endpoint
13. `src/health/` — health.controller.ts (inject PrismaService, SELECT 1 check) + health.module.ts using `createHealthModule(HealthController, { imports: [PrismaModule] })` from `@fintech/shared-health`
14. `src/common/filters/global-exception.filter.ts` — unique error format
15. `src/app.module.ts` — wire everything
16. `src/main.ts` — bootstrap with ValidationPipe, CORS, GlobalExceptionFilter, Swagger
17. `Dockerfile` — multi-stage build

**Critical implementation details (from spec section 3.8):**

- PaymentService bridge must map SDK `Transaction` → `MappedTransaction` (hide walletIds, derive direction, resolve counterparty names)
- Balance fetched via `getClient()` → `wallet.balance` (SDK has no `getBalance()`)
- Registration: call `createClient({ email, name, platformId })` FIRST, then save User with `paymentClientId` + `walletId`
- Self-transfer check: `sender.id === recipient.id` → reject
- Idempotency keys: `crypto.randomUUID()` generated by backend
- Transfer recipient resolved from LOCAL User table by email

### 6. Generate Frontend (`platforms/<slug>/web`)

Create `platforms/<slug>/web/` following the spec. Key files:

1. `package.json` — next, react, react-dom (no TanStack Query, no Zustand)
2. `tsconfig.json`
3. `next.config.ts`
4. `tailwind.config.ts` — with chosen color palette and fonts
5. `.env.example` — `API_URL`, `NEXT_PUBLIC_APP_NAME`
6. `.gitignore`
7. `public/logo.svg` — full logo (icon + wordmark), generated in step 4
8. `public/favicon.svg` — icon only, generated in step 4
9. `src/lib/api.ts` — server-side only fetch wrapper using `cookies()`
10. `src/lib/errors.ts` — `ApiError` class matching backend's error format
11. `src/actions/auth.ts` — login, register, logout server actions
12. `src/actions/payment.ts` — deposit, transfer server actions with `revalidatePath`
13. `src/actions/user.ts` — searchUser server action
14. `src/app/layout.tsx` — root layout with fonts, metadata, favicon reference
15. `src/app/page.tsx` — landing page (unique style, logo in header)
16. `src/app/(auth)/login/page.tsx` + `src/components/forms/login-form.tsx`
17. `src/app/(auth)/register/page.tsx` + `src/components/forms/register-form.tsx`
18. `src/app/(dashboard)/layout.tsx` — auth guard + dashboard shell (logo in sidebar/nav)
19. `src/app/(dashboard)/dashboard/page.tsx` — Server Component: balance + recent transactions
20. `src/app/(dashboard)/deposit/page.tsx` + deposit form
21. `src/app/(dashboard)/send/page.tsx` + send form (multi-step: email search → amount → confirm)
22. `src/app/(dashboard)/history/page.tsx` — Server Component with searchParams for pagination/filter
23. `src/components/ui/` — button, input, card, badge
24. `src/components/layout/` — header, sidebar/nav, footer

**Critical frontend details:**

- All API calls go through Server Components or Server Actions — never client-side fetch
- `lib/api.ts` uses `cookies()` from `next/headers` — server-only
- Forms use `useActionState` pattern (React 19)
- After deposit/transfer: `revalidatePath('/dashboard')`
- History pagination via URL `searchParams` (`?page=2&type=sent`)
- Auth via httpOnly cookie (set in server action, read in layout guard)

### 7. Generate docker-compose.yml

Create `platforms/<slug>/docker-compose.yml` using orange as the reference (`platforms/orange/docker-compose.yml`).
Use Caddy labels so Caddy docker-proxy auto-detects and routes `<slug>.localhost`.

```yaml
name: <slug>

services:
  <slug>-api:
    build:
      context: ../../              # monorepo root — required for pnpm workspace deps
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

### 8. Update Client Registry

Add a row to `docs/client-registry.md` with all traits.

### 9. Verify TypeScript compiles

```bash
# Install deps (new workspace member)
pnpm install

# Build ALL shared packages first (dist/ must exist before compiling the new API)
pnpm --filter @fintech/shared-config run build
pnpm --filter @fintech/payment-sdk run build
pnpm --filter @fintech/shared-auth run build
pnpm --filter @fintech/shared-prisma run build
pnpm --filter @fintech/shared-health run build

# Generate Prisma client
cd platforms/<slug>/api && npx prisma generate

# Compile backend (check for errors)
cd platforms/<slug>/api && npx tsc --noEmit
```

### 10. Trigger deploy via platform-manager

After all files are generated and TypeScript compiles, deploy via platform-manager:

```bash
curl -X POST http://localhost:3020/platforms \
  -H 'Content-Type: application/json' \
  -d '{"slug": "<slug>", "displayName": "<displayName>"}'
```

Then poll status until RUNNING:
```bash
curl http://localhost:3020/platforms/<slug>/status
# { "status": "RUNNING", "siteUrl": "http://<slug>.localhost", "swaggerUrl": "http://<slug>.localhost/api/docs" }
```

Or use the platform-manager-web UI: http://localhost:3021/platforms/new

## Invariants (Never Violate)

These rules apply to EVERY generated project regardless of customization:

- `@fintech/payment-sdk` for all payment operations
- NestJS 11 + Prisma 7 (no `url` in datasource, output inside `src/`, import from `generated/prisma/client`)
- PrismaService: `withPrismaAdapterPg(PrismaClient)` from `@fintech/shared-prisma` — never manual Pool setup
- Auth: `createAuthModule()` in app.module.ts, `JwtAuthGuard`/`CurrentUser`/`hashPassword`/`comparePassword` from `@fintech/shared-auth` — never duplicate these locally
- Health: `createHealthModule(Controller, { imports })` from `@fintech/shared-health`
- Env validation: extend `BaseEnvironmentVariables` + `createValidator` from `@fintech/shared-config`
- tsconfig: `rootDir: "./src"`, `incremental: false`, ALL `@fintech/*` paths → `../../../packages/<pkg>/dist/index` (3 levels up from `platforms/<slug>/api/`)
- nest-cli.json: tsc builder (NOT SWC), `deleteOutDir: true`
- User model: `paymentClientId @unique` + `walletId @unique`
- Registration order: payment client FIRST (with `platformId`), then local User
- `GlobalExceptionFilter` catches `PaymentServiceError` and re-maps to unique format
- Payment-service IDs and error structure never leaked to frontend
- `GET /health` — public, no auth
- Env validation at startup — crash on missing vars
- Strict TypeScript — no `any`, no `as` without reason
- Frontend: Server Components for reads, Server Actions for writes
- Frontend: httpOnly cookies, `lib/api.ts` is server-only
- Frontend: forms use `useActionState`, history uses URL searchParams

## Additional Resources

### Reference Files

- **`docs/client-platform-spec.md`** — Full specification with architecture, schemas, bridge code, frontend patterns, Docker config, and generation checklist
- **`docs/client-registry.md`** — Registry of existing clients (ports, styles, colors)

### Existing Code to Study

- **`packages/payment-sdk/src/`** — SDK types and client (understand what bridge wraps)
- **`packages/shared-auth/src/`** — createAuthModule, JwtAuthGuard, CurrentUser, hashPassword/comparePassword
- **`packages/shared-prisma/src/`** — withPrismaAdapterPg mixin
- **`packages/shared-health/src/`** — createHealthModule factory
- **`packages/shared-config/src/`** — BaseEnvironmentVariables, createValidator
- **`platforms/orange/api/src/`** — reference backend implementation
- **`platforms/orange/web/src/`** — reference frontend implementation
- **`platforms/orange/docker-compose.yml`** — reference docker-compose with Caddy labels
- **`apps/payment-service/src/`** — Payment core (understand what SDK calls)
