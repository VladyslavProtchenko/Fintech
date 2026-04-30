# Uniqueness Options Reference

Pre-built sets of traits for quick selection. Each generated client picks ONE option per category that hasn't been used by existing clients.

## Endpoint Styles

| Style | Auth | Balance | Deposit | Transfer | Search | History |
|-------|------|---------|---------|----------|--------|---------|
| A: `/wallet` | `/auth/register`, `/auth/login` | `/wallet/balance` | `/wallet/deposit` | `/wallet/transfer` | `/users/search` | `/wallet/history` |
| B: `/funds` | `/signup`, `/signin` | `/account/funds` | `/funds/add` | `/funds/send` | `/members/find` | `/funds/activity` |
| C: `/api` | `/api/users`, `/api/sessions` | `/api/balance` | `/api/deposit` | `/api/send` | `/api/users/lookup` | `/api/transactions` |
| D: `/v1` | `/v1/account/create`, `/v1/account/login` | `/v1/wallet` | `/v1/wallet/fund` | `/v1/payments/send` | `/v1/recipients/check` | `/v1/payments/history` |
| E: `/me` | `/auth/signup`, `/auth/signin` | `/me/balance` | `/me/deposit` | `/me/transfer` | `/people/search` | `/me/transactions` |
| F: `/account` | `/register`, `/login` | `/account/overview` | `/account/topup` | `/account/pay` | `/users/find` | `/account/ledger` |

## Error Response Formats

### Style A: Nested Object
```json
{ "error": { "type": "VALIDATION_ERROR", "detail": "Amount is required", "status": 400 } }
```

### Style B: Flat
```json
{ "code": "validation_failed", "message": "Amount is required", "statusCode": 400 }
```

### Style C: API Envelope
```json
{ "success": false, "error": { "code": "ERR_VALIDATION", "message": "Amount is required" } }
```

### Style D: Verbose Array
```json
{ "ok": false, "errors": [{ "field": "amount", "reason": "Required" }], "timestamp": "..." }
```

### Style E: HTTP-centric
```json
{ "status": 400, "title": "Validation Error", "detail": "Amount is required", "instance": "/wallet/deposit" }
```

### Style F: Minimal
```json
{ "error": "validation_error", "message": "Amount is required" }
```

## Color Palettes (by hue)

| Hue | Name | Primary | Secondary | Accent | Background |
|-----|------|---------|-----------|--------|------------|
| 0 | Red | #DC2626 | #FCA5A5 | #F97316 | #FFF5F5 |
| 30 | Orange | #EA580C | #FDBA74 | #EAB308 | #FFFBEB |
| 150 | Green | #16A34A | #86EFAC | #14B8A6 | #F0FDF4 |
| 200 | Cyan | #0891B2 | #67E8F9 | #6366F1 | #ECFEFF |
| 220 | Blue | #2563EB | #93C5FD | #8B5CF6 | #EFF6FF |
| 260 | Purple | #7C3AED | #C4B5FD | #EC4899 | #FAF5FF |
| 330 | Pink | #DB2777 | #F9A8D4 | #F43F5E | #FDF2F8 |
| 45 | Amber | #D97706 | #FCD34D | #84CC16 | #FFFBEB |
| 170 | Teal | #0D9488 | #5EEAD4 | #06B6D4 | #F0FDFA |
| 280 | Violet | #6D28D9 | #A78BFA | #F472B6 | #F5F3FF |

## Google Fonts Pairings

| Set | Heading | Body |
|-----|---------|------|
| A | Inter | Inter |
| B | Poppins | Open Sans |
| C | Montserrat | Lato |
| D | Playfair Display | Source Sans 3 |
| E | Space Grotesk | DM Sans |
| F | Outfit | Nunito |
| G | Sora | Work Sans |
| H | Plus Jakarta Sans | IBM Plex Sans |
| I | Lexend | Karla |
| J | Manrope | Rubik |

## Dashboard Layout Variants

### Sidebar Left
- Fixed left sidebar (200-250px) with icon + text nav
- Main content area with top header (user name, logout)
- Best with: darker sidebar color, lighter content area

### Sidebar Right
- Content area takes most of the screen
- Narrow right sidebar with quick actions and summary
- Best with: minimal sidebar, card-based content

### Top Nav
- Horizontal navigation bar at top
- Full-width content below
- Dropdown for user menu
- Best with: clean, spacious layouts

### Minimal
- No persistent sidebar
- Tab-based navigation within content area
- Floating action buttons for deposit/send
- Best with: mobile-first, card-heavy designs

## Landing Page Styles

### Hero Centered
- Large centered heading + subtext
- CTA buttons centered below
- Features grid below hero
- Best with: bold typography, gradient backgrounds

### Hero Split
- Left side: text + CTA buttons
- Right side: illustration/mockup placeholder
- Features section below
- Best with: clean, professional look

### Hero Gradient
- Full-width gradient background
- White text overlay
- Feature cards overlapping hero section
- Best with: vibrant color palettes

### Minimal
- Simple heading + one-liner
- Single CTA button
- Feature list (not cards)
- Lots of whitespace
- Best with: monospace-friendly fonts, muted colors

## Terminology Sets

| Set | Balance | Deposit | Send | History |
|-----|---------|---------|------|---------|
| A | Balance | Deposit | Send Money | Transaction History |
| B | Available Funds | Add Funds | Transfer | Activity Log |
| C | Account Total | Top Up | Pay Someone | Recent Activity |
| D | Your Money | Load Balance | Move Money | Payment History |
| E | Wallet | Fund Account | Quick Send | Ledger |
| F | Current Balance | Recharge | Send Funds | Transactions |

## Transaction Display Styles

### Table
- Traditional table with columns: Type | Amount | Date | Status | Counterparty
- Sortable headers, striped rows
- Best with: data-heavy, professional look

### Card List
- Each transaction is a card with icon, amount, details
- Stacked vertically
- Best with: mobile-friendly, modern designs

### Timeline
- Vertical timeline with dots/lines connecting transactions
- Date headers grouping transactions
- Best with: chronological focus, minimal designs
