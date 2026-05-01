# Strategy Output Template

The strategy produced by platform-research is the contract for all subsequent skills. Every field below is REQUIRED — downstream skills depend on them.

## Identity

- **slug** — lowercase, no spaces, used for directories and domains (e.g., `cactus`, `apricot`)
- **displayName** — human-readable brand name shown in UI and metadata (e.g., `Cactus Finance`, `Apricot UA`)
- **tagline** — one-line brand slogan for landing page

## Ports

- **apiPort** — next available even port starting from 3014 (increment by 2 per platform)
- **webPort** — apiPort + 1

Already taken ports (from client-registry.md):
- greenapple: 3010/3011
- orange: 3012/3013
- cactus: 3014/3015
- apricot: 3016/3017

## Visual Identity

- **colorHue** — 0-360, must differ by 30+ degrees from every existing platform
- **primaryColor** — hex value derived from hue (e.g., `#0d9488` for teal)
- **fontHeading** — Google Font for headings (e.g., `Outfit`, `Montserrat`)
- **fontBody** — Google Font for body text (e.g., `Inter`, `Nunito Sans`)
- **layoutVariant** — dashboard layout: `sidebar-left`, `sidebar-right`, `top-nav`, `minimal`
- **landingStyle** — hero section: `hero-centered`, `hero-split`, `hero-gradient`, `minimal`
- **transactionDisplay** — how transactions render: `table`, `card-list`, `timeline`
- **logoConceptDescription** — one sentence describing the icon concept for platform-design

Already taken (from client-registry.md):
- Colors: 120 (green), 30 (orange), 150 (teal), 215 (blue)
- Fonts: Nunito+Inter, Poppins+DM Sans, Outfit+Inter, Montserrat+Nunito Sans
- Layouts: top-nav, sidebar-left, sidebar-right, top-nav minimal

## Backend Traits

- **endpointPrefix** — global route prefix (e.g., `/api/v2`, `/v1`, none)
- **endpointStyle** — controller path patterns (e.g., `/wallet/*`, `/account/*`, `/funds/*`)
- **errorFormat** — error response structure, one of:
  - nested: `{ error: { type, detail, status } }`
  - flat: `{ message, code, statusCode }`
  - verbose: `{ ok: false, errors: [{ field, reason }] }`
  - api-style: `{ success: false, error: { code, message, details } }`
- **moduleName** — main domain module directory (e.g., `wallet`, `account`, `funds`, `balance`)
- **dtoFieldAmount** — field name for money amount: `amount`, `sum`, `value`
- **dtoFieldRecipient** — field name for transfer target: `recipient`, `toEmail`, `recipientEmail`
- **errorCodeStyle** — naming: `VALIDATION_ERROR`, `validation_failed`, `ERR_VALIDATION`

Already taken (from client-registry.md):
- Endpoints: /signup+/account/*, /auth/*+/wallet/*, /v1/account/*+/v1/wallet/*, /api/v2/users/*+/api/v2/wallet/*
- Errors: success:false+error.code, nested error.type+detail, verbose ok:false+errors[], flat message+code
- Modules: account (greenapple), wallet (orange), account (cactus), balance (apricot)
- DTO amounts: amount (greenapple, apricot), value (orange), sum (cactus)

## Frontend Terminology

All four terms must be unique as a set — not matching any existing platform:

- **termBalance** — how balance is labeled (e.g., "Balance", "Available Funds", "My Money")
- **termDeposit** — deposit action label (e.g., "Add Funds", "Top Up", "Load Balance")
- **termSend** — transfer action label (e.g., "Send to Friend", "Transfer", "Wire Money")
- **termHistory** — transaction history label (e.g., "Activity", "Transactions", "Ledger")

## Landing Page Content

- **heroTitle** — main headline based on business concept
- **heroSubtitle** — supporting text (1-2 sentences)
- **sections** — list of 3-5 content sections for landing page, each with:
  - title
  - brief description of what content to write
- **industryContext** — 2-3 sentences about the industry (from research) to guide content writing

## Secrets (read from source files, never guess)

- **paymentApiKey** — copied from `apps/payment-service/.env` field `API_KEY`
- **databaseUrlFormat** — copied from any existing `platforms/*/api/.env` (change only DB name to `<slug>_db`)

## Research Notes

- **competitors** — 3-5 competitor names and their website URLs
- **designPatterns** — what design patterns are common in this industry
- **colorAssociations** — what colors are associated with this industry
- **contentTone** — formal, friendly, technical, casual
