---
name: Platform Design
description: >
  This skill should be used when the user asks to "design platform brand",
  "create platform logo", "generate brand identity", "design platform visuals",
  or as the second step in the platform generation pipeline after platform-research.
  Creates SVG logo, favicon, and design tokens for a white-label payment platform.
---

# Platform Design

Create a complete visual identity for a new payment platform: SVG logo, SVG favicon, color palette, and design tokens. All decisions are based on the strategy produced by platform-research.

## Input

The strategy from platform-research (in conversation context), specifically:
- slug and displayName
- colorHue and primaryColor
- fontHeading and fontBody
- layoutVariant and landingStyle
- logoConceptDescription

## Workflow

### Step 1 — Develop Icon Concepts

Propose 3 icon concepts tied to the platform name and business theme:
- Each concept: shape description + rationale
- Concepts must be geometric, abstract, and work in a single color
- Consider how the icon reads at 16px (favicon size)

Select the strongest concept — most recognizable at small sizes, simplest geometry.

### Step 2 — Generate SVG Files

Create two SVG files (content stays in context, written to disk by platform-web):

**Logo** (`logo.svg`):
- ViewBox `0 0 160 40`
- Icon (32x32) on the left + wordmark text on the right
- Single primary color, font-weight 700
- System font stack or geometric letter paths

**Favicon** (`favicon.svg`):
- ViewBox `0 0 32 32`
- Same icon, centered with 2px padding
- Must be readable at 16px

Follow all rules in `references/svg-guidelines.md`.

### Step 3 — Define Color Palette

Generate a full shade palette from the chosen hue (50 through 950). Use HSL with fixed hue, varying saturation and lightness:
- 50: background tint (lightness ~97%)
- 500: base primary color
- 600: hover state
- 700: dark text on light backgrounds
- 950: near-black

### Step 4 — Confirm Font Pairing

Verify the chosen fonts from the strategy:
- Both must be available on Google Fonts
- Must not match any existing platform's pair
- Heading font: distinctive, good for large sizes
- Body font: highly readable at 14-16px

### Step 5 — Define Design Tokens

Prepare tokens for Tailwind CSS `@theme` block:
- Primary color palette (50-950)
- Font family declarations (heading + body)
- Border radius preference (rounded, sharp, pill)
- Shadow style (subtle, medium, none)

## Output

All outputs stay in conversation context (no files written to disk yet):
- Logo SVG content
- Favicon SVG content
- Color palette (all shades)
- Font import URLs (Google Fonts)
- Design tokens for Tailwind

Do NOT pause or wait for confirmation — proceed immediately to platform-api.

## Reference Files

- **`references/svg-guidelines.md`** — SVG structure templates, icon design rules, existing platform icons, color palette generation, available font pairings
