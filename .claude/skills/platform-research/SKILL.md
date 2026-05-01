---
name: Platform Research
description: >
  This skill should be used when the user asks to "research platform",
  "analyze business", "create brand strategy", "study competitors",
  "plan new platform", or provides a business description for a new
  white-label payment platform. First step in the platform generation pipeline.
  Produces a complete brand strategy used by all subsequent platform-* skills.
---

# Platform Research

Analyze a business description, research the market, and produce a complete brand strategy for a new white-label payment platform. The strategy serves as the single source of truth for all downstream skills (platform-design, platform-api, platform-web, platform-deploy).

## Input

A business description from the user — free-form text containing:
- Business name or idea
- Industry / sphere of activity
- Target audience or business concept

If the description is vague, extract what is possible and fill gaps with research findings.

## Workflow

### Step 1 — Parse the Business Description

Extract from the user's input:
- Industry and sub-industry
- Target audience (who are the customers)
- Key services or products
- Communication tone (formal, friendly, technical, casual)
- How payment features fit into the business narrative

### Step 2 — Research the Market

Search the internet for companies in this industry. For each competitor found:
- Note their website URL
- Observe design patterns (colors, layout, navigation style)
- Note content structure (what sections they have on landing page)
- Identify industry-standard terminology

Collect 3-5 competitors minimum. Document:
- Common color associations for this industry
- Typical website structures
- Content patterns and tone

### Step 3 — Check the Registry

Read `docs/client-registry.md` to identify all taken values:
- Slugs and port pairs
- Endpoint styles and error formats
- Color hues, fonts, layout variants
- Terminology sets

Scan `platforms/` directory to confirm existing slugs on disk.

Assign the next available port pair (even number for API, +1 for web).

### Step 4 — Read Secrets

Read real values from source files — never guess or hardcode:
- `PAYMENT_API_KEY` from `apps/payment-service/.env` (field `API_KEY`)
- `DATABASE_URL` format from any existing `platforms/*/api/.env` — copy the connection string format exactly, only replace the database name with `<slug>_db`

### Step 5 — Formulate the Strategy

Produce a strategy covering every field in the template. Each choice must:
- Not conflict with existing platforms (check registry)
- Be informed by market research (colors, tone, content)
- Be internally consistent (slug matches brand, colors match industry)

Key uniqueness rules:
- Color hue: 30+ degrees from every existing hue
- Fonts: different pair from all existing platforms
- Layout variant: prefer unused variants, reuse only if all four are taken
- Endpoint style: must not match any existing pattern
- Error format: must not match any existing format
- DTO field names: vary from existing where possible
- Terminology set: all four terms must differ as a complete set

### Step 6 — Output the Strategy

Present the complete strategy in a structured format. Do NOT create any files — the strategy stays in conversation context and flows directly to the next skill.

Do NOT pause or wait for confirmation — proceed immediately to the next skill in the pipeline (platform-design).

## Strategy Output Format

Present the strategy using clear sections with all fields from the template. Example structure:

```
STRATEGY: <displayName>
===

Identity: slug=<slug>, name=<displayName>, tagline=<tagline>
Ports: API=<apiPort>, Web=<webPort>

Visual: hue=<colorHue> (<primaryColor>), fonts=<fontHeading>+<fontBody>
Layout: dashboard=<layoutVariant>, landing=<landingStyle>, transactions=<transactionDisplay>
Logo concept: <logoConceptDescription>

Backend: prefix=<endpointPrefix>, module=<moduleName>
Endpoints: <endpointStyle description>
Errors: <errorFormat description>
DTO fields: amount=<dtoFieldAmount>, recipient=<dtoFieldRecipient>
Error codes: <errorCodeStyle>

Terminology: balance=<termBalance>, deposit=<termDeposit>, send=<termSend>, history=<termHistory>

Landing content:
- Hero: <heroTitle> / <heroSubtitle>
- Sections: <list of sections>
- Industry context: <industryContext>

Secrets:
- PAYMENT_API_KEY=<value from file>
- DATABASE_URL=<format with slug_db>

Research notes:
- Competitors: <list>
- Design patterns: <notes>
- Color associations: <notes>
```

## Reference Files

For the complete list of required strategy fields and what values are already taken:
- **`references/strategy-template.md`** — full template with all fields, descriptions, and existing platform values

## Project Files to Read

- `docs/client-registry.md` — existing platforms registry
- `apps/payment-service/.env` — PAYMENT_API_KEY source
- `platforms/*/api/.env` — DATABASE_URL format source
- `docs/site-generator-vision.md` — business context and overall flow
