---
name: Platform Web
description: >
  This skill should be used when the user asks to "generate platform frontend",
  "create platform website", "build Next.js frontend for platform", or as the fourth
  step in the platform generation pipeline after platform-api. Generates a complete
  Next.js frontend for a white-label payment platform.
---

# Platform Web

Generate a complete Next.js frontend project at `platforms/<slug>/web/` with unique design, content, and branding. The frontend communicates with the generated API via Server Components and Server Actions.

## Input

From conversation context:
- Strategy from platform-research (terminology, landing content, industry context)
- Design tokens from platform-design (SVG logo/favicon, color palette, fonts)
- Generated API from platform-api (endpoint paths, DTO field names, error format)

## Pre-Generation Step — Read API Contract (CRITICAL)

Before writing any frontend code, read the generated API files to extract the real contract:

1. **Controllers** — `platforms/<slug>/api/src/**/*.controller.ts`
   - Extract exact endpoint paths (e.g., `@Post('topup')` under `@Controller('wallet')`)
   - Note which endpoints require auth (`@UseGuards(JwtAuthGuard)`)

2. **DTOs** — `platforms/<slug>/api/src/**/dto/*.ts`
   - Extract exact field names (amount vs sum vs value, toEmail vs recipientEmail)
   - Note validation decorators

3. **Error filter** — `platforms/<slug>/api/src/common/filters/global-exception.filter.ts`
   - Understand the error response structure for frontend error parsing

4. **main.ts** — `platforms/<slug>/api/src/main.ts`
   - Check global prefix (e.g., `api/v2`) — frontend URLs must include it

Build a route map before generating any actions or API calls:
```
POST /auth/register     → { email, password, name }
POST /auth/login        → { email, password }
GET  /wallet            → balance + recent transactions
POST /wallet/deposit    → { amount }
POST /wallet/transfer   → { toEmail, amount }
GET  /wallet/history    → query: page, type
GET  /users/search      → query: email
```

## Workflow

### Step 1 — Project Config

- `package.json` — next, react, react-dom, @types (no TanStack Query, no Zustand)
- `tsconfig.json`
- `next.config.ts` — `output: 'standalone'`
- `postcss.config.mjs` — `@tailwindcss/postcss`
- `.env.local`, `.env.example`
- `.gitignore`
- `.dockerignore` — REQUIRED (node_modules, .next, .env.local)

### Step 2 — Static Assets

- `public/logo.svg` — from platform-design
- `public/favicon.svg` — from platform-design

### Step 3 — Styles

- `src/app/globals.css` — Tailwind 4 @theme with color palette and font declarations from platform-design

### Step 4 — API Layer

- `src/lib/api.ts` — server-only fetch wrapper with cookies(), query support, ApiError class (see invariants)

### Step 5 — Server Actions

Generate actions using EXACT paths from the API contract:
- `src/actions/auth.ts` — login, register (set httpOnly cookie), logout (delete cookie)
- `src/actions/payment.ts` — deposit (revalidate + redirect), wire (revalidate + return null)
- `src/actions/user.ts` — searchUser (use query option)

### Step 6 — Layout & Landing

- `src/app/layout.tsx` — root layout with Google Fonts, metadata, favicon reference
- `src/app/page.tsx` — landing page with UNIQUE content about the business:
  - Hero section with strategy's heroTitle and heroSubtitle
  - Content sections from strategy (industry-specific, not generic)
  - Call-to-action to register
  - Logo in header
  - Styled according to platform-design tokens

### Step 7 — Auth Pages

- `src/app/(auth)/login/page.tsx` + `src/components/forms/login-form.tsx`
- `src/app/(auth)/register/page.tsx` + `src/components/forms/register-form.tsx`
- Both use `useActionState` pattern

### Step 8 — Dashboard

- `src/app/(dashboard)/layout.tsx` — auth guard (check cookie, redirect to /login) + shell with logo
- `src/app/(dashboard)/dashboard/page.tsx` — Server Component with graceful error handling
- `src/app/(dashboard)/deposit/page.tsx` + deposit form
- `src/app/(dashboard)/send/page.tsx` + multi-step send form (email search → amount → confirm → done)
- `src/app/(dashboard)/history/page.tsx` — Server Component with searchParams pagination

### Step 9 — UI Components

- `src/components/ui/` — button, input, card, badge (styled with design tokens)
- `src/components/layout/` — header, sidebar/nav, footer (matching layoutVariant from strategy)

### Step 10 — Dockerfile

Generate Web Dockerfile with standalone output (see invariants).

## Design Requirements

- Landing page content must be UNIQUE — based on research from platform-research, not generic text
- Dashboard must reflect the business theme, not just be a bare wallet
- Pay detailed attention to spacing, typography hierarchy, color usage
- Each platform must feel like a different product
- Use the layoutVariant from strategy (sidebar-left, sidebar-right, top-nav, minimal)
- Use the transactionDisplay style from strategy (table, card-list, timeline)

## Output

All files written to `platforms/<slug>/web/`. Do NOT pause — proceed immediately to platform-deploy.

## Reference Files

- **`references/invariants.md`** — frontend rules: api.ts pattern, useActionState, send-form success detection, graceful error handling, auth guard, Dockerfile, .dockerignore, Tailwind 4 config
