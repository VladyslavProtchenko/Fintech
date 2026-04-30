# White-Label Payment Platform — Master Plan

## Goal

Build a system where each client gets a fully unique, independent payment platform (backend + frontend) that uses our payment core under the hood. The client never knows about the shared engine.

## Architecture

```
packages/
  payment-sdk/                  <-- shared TypeScript SDK (npm package in monorepo)
                                    wraps payment-service HTTP API into typed methods
                                    the ONLY shared code between client projects

apps/
  payment-service/              <-- core engine (already built, port 3004)
                                    clients, wallets, transactions, idempotency
                                    protected by API key, never exposed to end users

  acme-api/                     <-- Client "Acme" backend (NestJS, unique code)
  acme-web/                     <-- Client "Acme" frontend (Next.js, unique design)

  globex-api/                   <-- Client "Globex" backend (NestJS, unique code)
  globex-web/                   <-- Client "Globex" frontend (Next.js, unique design)

docs/
  client-platform-spec.md       <-- specification: what every client project must do
                                    capabilities, constraints, payment-sdk usage

skills/
  create-client-platform/       <-- Claude Code skill (prompt instructions)
                                    reads spec + SDK types, generates unique project
```

## How It Works

### Step 1 — payment-sdk (shared package)

TypeScript package in the monorepo. Wraps all payment-service API calls:

```typescript
import { PaymentClient } from '@fintech/payment-sdk';

const payments = new PaymentClient({
  baseUrl: 'http://payment-service:3004',
  apiKey: 'client-specific-secret',
});

await payments.createClient({ email, name });
await payments.topup({ clientId, amount, idempotencyKey });
await payments.transfer({ fromClientId, toClientId, amount, idempotencyKey });
await payments.withdraw({ clientId, amount, idempotencyKey });
const tx = await payments.getTransaction(id);
const history = await payments.listTransactions({ clientId, page, limit });
const client = await payments.getClient(id);
```

Each client backend imports `@fintech/payment-sdk` and uses it internally.
End users never call payment-service directly.

### Step 2 — Client Platform Spec (document)

A detailed specification that defines:

- **What every client project must include:**
  - User auth (registration, login, JWT)
  - Wallet view (balance display)
  - Payment operations (send money, top up, withdraw)
  - Transaction history (list, filters, details)
  - Dashboard (summary stats)
  - Health endpoint

- **What must be UNIQUE per client:**
  - Endpoint naming and URL structure (REST/different conventions)
  - Error response format and codes
  - API response shapes (different field names, wrappers)
  - Frontend design, layout, color scheme, typography
  - Page structure and navigation
  - Component patterns and UI library choices
  - Copy/text/language

- **What connects to the core:**
  - All payment operations go through payment-sdk
  - Each client has their own API_KEY for payment-service
  - Client backend is the only layer that talks to payment-sdk
  - Frontend only talks to its own client backend

### Step 3 — Claude Code Skill

A skill (prompt) that Claude Code executes when creating a new client.

**Trigger:** `/create-client-platform`

**Flow:**
1. Claude asks: name, style, features, domain, ports
2. Claude reads: client-platform-spec.md + payment-sdk types
3. Claude generates: unique NestJS backend + Next.js frontend
4. Claude verifies: builds pass, endpoints work

**Key instruction for Claude:**
- Generate code from scratch, never copy from existing clients
- Every project must look and feel different
- Different endpoint names, different error formats, different UI
- Use payment-sdk for all payment operations
- Follow monorepo conventions (tsconfig, eslint, Prisma for local user DB)

### Step 4 — New Client Creation

```bash
# In Claude Code:
> /create-client-platform

# Interactive questions:
> Name? --> "Acme Payments"
> Description? --> "Fast B2B payment platform for logistics companies"
> Style? --> "Minimalist dark theme, professional"
> Key features? --> "Bulk transfers, detailed analytics, export CSV"
> Domain? --> "pay.acme.com"
> API port? --> 3010
> Web port? --> 3011

# Claude generates:
> apps/acme-api/    -- unique NestJS backend
> apps/acme-web/    -- unique Next.js frontend
> Both fully working, connected via payment-sdk to core
```

## Implementation Order

| # | Step | What | Details |
|---|------|------|---------|
| 1 | payment-sdk | `packages/payment-sdk/` | Typed HTTP client, all payment-service operations, error handling |
| 2 | client-platform-spec | `docs/client-platform-spec.md` | Full specification of what client projects must contain |
| 3 | Claude Code skill | `skills/create-client-platform/` | Prompt that generates unique projects from spec |
| 4 | First client | `apps/acme-api/` + `apps/acme-web/` | Generate first client to validate the system |
| 5 | Second client | `apps/globex-api/` + `apps/globex-web/` | Generate second client — must be visually and structurally different |

## Key Principles

1. **payment-sdk is the only bridge** — no direct HTTP calls to payment-service from client code
2. **Every client is unique** — different code, different design, different API shape
3. **No templates** — Claude generates from scratch using spec as a guide, not as a copy source
4. **Independence** — each client can be modified without affecting others
5. **Shared core** — bug fixes in payment-service benefit all clients automatically
6. **End user sees nothing shared** — different domain, different UI, different API responses
