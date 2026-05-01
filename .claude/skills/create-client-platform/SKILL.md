---
name: Create Client Platform
description: >
  This skill should be used when the user asks to "create a client platform",
  "generate a new client", "add a new platform", "create client-api and client-web",
  "scaffold a payment client", or wants to generate a new white-label payment platform
  project (NestJS backend + Next.js frontend) that uses @fintech/payment-sdk.
---

# Create Client Platform — Orchestrator

Generate a complete white-label payment platform (NestJS backend + Next.js frontend) from a business description. This orchestrator runs 5 skills sequentially without pauses or confirmations.

## Input

A business description from the user: name, industry, concept.

## Pipeline

Execute these skills in order. Do NOT stop between steps. Do NOT ask for confirmation.

### 1. platform-research

Read the skill at `.claude/skills/platform-research/SKILL.md` and follow it.

Parse the business description, search the internet for competitors, check the client registry for conflicts, read secrets from source files, and produce a complete brand strategy.

Output: strategy in conversation context.

### 2. platform-design

Read the skill at `.claude/skills/platform-design/SKILL.md` and follow it.

Design SVG logo and favicon, define color palette and font pairing, prepare design tokens.

Output: SVG content and design tokens in conversation context.

### 3. platform-api

Read the skill at `.claude/skills/platform-api/SKILL.md` and follow it.

Generate the complete NestJS backend at `platforms/<slug>/api/`. Read reference implementations and shared package sources before generating.

Output: all API files on disk.

### 4. platform-web

Read the skill at `.claude/skills/platform-web/SKILL.md` and follow it.

CRITICAL: Read the generated API controllers and DTOs BEFORE generating frontend code. This prevents endpoint URL mismatches.

Generate the complete Next.js frontend at `platforms/<slug>/web/`.

Output: all Web files on disk.

### 5. platform-deploy

Read the skill at `.claude/skills/platform-deploy/SKILL.md` and follow it.

Create docker-compose, update infrastructure files, compile TypeScript, deploy containers, verify health.

Output: two live URLs.

## Completion

The task is COMPLETE only when platform-deploy returns:
- **Site:** `http://<slug>.localhost`
- **Swagger:** `http://<slug>.localhost/api/docs`

If any step fails — fix the error and continue. Never leave the pipeline incomplete.

## Additional Resources

- **`docs/site-generator-vision.md`** — business logic and overall flow
- **`docs/skills-plan.md`** — detailed specification of each skill
- **`docs/client-platform-spec.md`** — technical reference with code patterns
- **`docs/client-registry.md`** — existing platforms registry
