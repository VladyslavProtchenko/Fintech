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

Scan `apps/` for existing `*-api` and `*-web` directories to confirm.

Assign the next available port pair (starting from 3010, incrementing by 2 per client).

**Also read and save these values NOW (needed for `.env` generation later):**
- `PAYMENT_API_KEY` → read from `apps/payment-service/.env` (field `API_KEY`)
- `DATABASE_URL` format → read from any existing client's `.env` (e.g. `apps/greenapple-api/.env`) — copy the username/host format exactly, only change the DB name

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

#### `apps/<slug>-web/public/logo.svg`
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

#### `apps/<slug>-web/public/favicon.svg`
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

#### `apps/<slug>-web/app/favicon.ico` reference
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

### 5. Generate Backend (`<slug>-api`)

Create `apps/<slug>-api/` following the spec. Key files in order:

1. `package.json` — with `@fintech/payment-sdk: "workspace:*"`, `@prisma/adapter-pg`, `pg`, `dotenv`, `passport`, and all NestJS deps. Script `start:dev` must be `prisma generate && nest start --watch`
2. `tsconfig.json` — extends `../../tsconfig.base.json`, set `rootDir: "./src"`, `incremental: false`, and override paths `@fintech/payment-sdk` → `../../packages/payment-sdk/dist/index` (NOT source)
3. `nest-cli.json` — tsc builder (NOT SWC), `deleteOutDir: true`
4. `prisma/schema.prisma` — User model with `paymentClientId` + `walletId` (no `url` in datasource). Output: `../src/generated/prisma` (MUST be inside `src/`)
5. `prisma.config.ts` — `defineConfig` with env DATABASE_URL
6. `.env` — all required vars including `PLATFORM_ID=<slug>` (create real .env for dev, not just .env.example). **IMPORTANT:** Read `PAYMENT_API_KEY` from `apps/payment-service/.env` and `DATABASE_URL` format from an existing client's `.env` (e.g. `apps/greenapple-api/.env`) — do NOT guess these values, copy them from the source of truth.
7. `.gitignore` — `src/generated/`, `generated/`, `dist/`, `node_modules/`, `.env`
8. `src/config/env.validation.ts` — validate all env vars at startup
9. `src/prisma/` — PrismaModule (global) + PrismaService (using `@prisma/adapter-pg` + `pg.Pool`, NOT `datasourceUrl`)
10. `src/auth/` — full auth module (controller, service, JWT strategy, guard, decorator, DTOs, types)
11. `src/payment/` (or chosen module name) — PaymentService bridge + controller + DTOs
12. `src/user/` (or chosen module name) — user search endpoint
13. `src/health/` — health module with terminus
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

### 6. Generate Frontend (`<slug>-web`)

Create `apps/<slug>-web/` following the spec. Key files:

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

### 7. Update Infrastructure

1. Add `CREATE DATABASE <slug>_db;` to `docker/postgres/init.sql`
2. Add `<slug>-api` and `<slug>-web` entries to `docker-compose.yml`
3. Ensure `@fintech/payment-sdk` path alias exists in `tsconfig.base.json`
4. Ensure root `package.json` has `pnpm.onlyBuiltDependencies` entries for `bcrypt`, `prisma` (pnpm v10 blocks native build scripts by default)
5. Create `apps/<slug>-web/.env.local` with `API_URL` and `NEXT_PUBLIC_APP_URL`
6. Create `apps/<slug>-api/.env` with all required vars (DATABASE_URL, JWT_SECRET, PAYMENT_API_URL, PAYMENT_API_KEY, PLATFORM_ID, FRONTEND_URL)

### 8. Update Client Registry

Add a row to `docs/client-registry.md` with all traits.

### 9. Verify

Run through the generation checklist from `docs/client-platform-spec.md` section 8.

Quick smoke test:
```bash
# 1. Ensure root package.json has pnpm.onlyBuiltDependencies for bcrypt/prisma
# 2. Install deps
pnpm install
# 3. Generate Prisma client
cd apps/<slug>-api && npx prisma generate
# 4. Build payment-sdk first (needed for path alias)
pnpm --filter @fintech/payment-sdk run build
# 5. Compile backend (check for errors)
cd apps/<slug>-api && npx tsc --noEmit
# 6. Run migration
cd apps/<slug>-api && DATABASE_URL=postgresql://... npx prisma migrate dev --name init
# 7. Start API and check health
cd apps/<slug>-api && node dist/main.js
curl http://localhost:<api-port>/health
# 8. Create .env.local for web, start frontend
cd apps/<slug>-web && pnpm dev
```

## Invariants (Never Violate)

These rules apply to EVERY generated project regardless of customization:

- `@fintech/payment-sdk` for all payment operations
- NestJS 11 + Prisma 7 (no `url` in datasource, output inside `src/`, import from `generated/prisma/client`)
- PrismaService: `@prisma/adapter-pg` + `pg.Pool` (never `datasourceUrl`)
- tsconfig: `rootDir: "./src"`, `incremental: false`, paths → `dist/index`
- nest-cli.json: tsc builder (NOT SWC), `deleteOutDir: true`
- JWT + Passport + bcrypt (12 rounds)
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
- **`apps/brand-service/src/auth/`** — JWT + Passport + bcrypt reference implementation
- **`apps/payment-service/src/`** — Payment core (understand what SDK calls)
