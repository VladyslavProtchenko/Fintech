---
name: Platform Test
description: >
  This skill should be used when the user asks to "test platform",
  "run E2E tests", "verify platform works", "check platform",
  "test deployed site", or wants to run end-to-end tests on a deployed
  white-label payment platform. Runs HTTP tests against live API and
  verifies frontend pages respond correctly.
---

# Platform Test

Run end-to-end tests against a deployed platform to verify all functionality works: registration, authentication, wallet operations, transfers, and frontend pages.

## Input

- Platform slug (e.g., `apricot`, `cactus`)
- Platform must be deployed and running at `http://<slug>.localhost`

## Pre-Test Step — Read API Contract

Before running tests, read the platform's API to know exact endpoints and field names:
- `platforms/<slug>/api/src/**/*.controller.ts` — endpoint paths
- `platforms/<slug>/api/src/**/dto/*.ts` — request body field names
- `platforms/<slug>/api/src/main.ts` — global prefix
- `docs/client-registry.md` — port and endpoint style

Build a route map with exact paths and field names for this specific platform.

## Test Suite

### Test 1 — Health

```bash
curl -s http://<slug>.localhost/api/health
```
Expected: 200 with health status response.

### Test 2 — Swagger

```bash
curl -s -o /dev/null -w "%{http_code}" http://<slug>.localhost/api/docs
```
Expected: 200.

### Test 3 — Register User A

```bash
curl -s -X POST http://<slug>.localhost/api/<auth-path>/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-<slug>@test.com","password":"TestPass123!","name":"Test User"}'
```
Expected: 200/201 with token or user data. Save the auth token.

### Test 4 — Login User A

```bash
curl -s -X POST http://<slug>.localhost/api/<auth-path>/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test-<slug>@test.com","password":"TestPass123!"}'
```
Expected: 200 with token. Save for subsequent requests.

### Test 5 — Balance (First Access — Lazy Provisioning)

```bash
curl -s http://<slug>.localhost/api/<wallet-path> \
  -H 'Authorization: Bearer <token>'
```
Expected: 200 with balance (should be 0 or "0.00"). This triggers lazy payment client creation.

### Test 6 — Deposit $500

```bash
curl -s -X POST http://<slug>.localhost/api/<wallet-path>/deposit \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"<amountField>":"500"}'
```
Expected: 200/201 with transaction data.

Verify balance is now 500:
```bash
curl -s http://<slug>.localhost/api/<wallet-path> \
  -H 'Authorization: Bearer <token>'
```

### Test 7 — Register User B

```bash
curl -s -X POST http://<slug>.localhost/api/<auth-path>/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test2-<slug>@test.com","password":"TestPass123!","name":"Test User 2"}'
```

### Test 8 — Transfer $100 from A to B

```bash
curl -s -X POST http://<slug>.localhost/api/<wallet-path>/transfer \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <tokenA>' \
  -d '{"<recipientField>":"test2-<slug>@test.com","<amountField>":"100"}'
```
Expected: 200/201.

Verify: A balance = 400, B balance = 100.

### Test 9 — Self-Transfer (Should Fail)

```bash
curl -s -X POST http://<slug>.localhost/api/<wallet-path>/transfer \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <tokenA>' \
  -d '{"<recipientField>":"test-<slug>@test.com","<amountField>":"50"}'
```
Expected: 400 or 422 error.

### Test 10 — Insufficient Funds (Should Fail)

```bash
curl -s -X POST http://<slug>.localhost/api/<wallet-path>/transfer \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <tokenA>' \
  -d '{"<recipientField>":"test2-<slug>@test.com","<amountField>":"10000"}'
```
Expected: 422 error.

### Test 11 — Transaction History

```bash
curl -s http://<slug>.localhost/api/<wallet-path>/transactions \
  -H 'Authorization: Bearer <tokenA>'
```
Expected: 200 with array of transactions (deposit + transfer).

### Test 12 — Frontend Pages

```bash
curl -s -o /dev/null -w "%{http_code}" http://<slug>.localhost           # Landing: 200
curl -s -o /dev/null -w "%{http_code}" http://<slug>.localhost/login      # Login: 200
curl -s -o /dev/null -w "%{http_code}" http://<slug>.localhost/register   # Register: 200
curl -s -o /dev/null -w "%{http_code}" http://<slug>.localhost/dashboard  # Dashboard: 307 (redirect to login)
```

## Output Format

```
PLATFORM TEST: <slug>
════════════════════════
[OK]   Health endpoint
[OK]   Swagger docs
[OK]   Register user A
[OK]   Login user A
[OK]   Balance (lazy provision) → $0.00
[OK]   Deposit $500 → balance $500.00
[OK]   Register user B
[FAIL] Transfer $100 → expected 200, got 500
       Request: POST /api/v1/wallet/transfer {"sum":"100","recipientEmail":"test2@test.com"}
       Response: {"error":"Internal server error"}
[SKIP] Self-transfer (blocked by previous failure)
[SKIP] Insufficient funds (blocked by previous failure)
[SKIP] Transaction history (blocked by previous failure)
[OK]   Frontend pages (landing, login, register, dashboard redirect)
════════════════════════
Result: 8/12 passed, 1 failed, 3 skipped
```

## Rules

- On failure: show full request (method, URL, body) and full response
- Skip dependent tests if a prerequisite fails (e.g., skip transfer tests if deposit fails)
- Use unique test emails per platform (`test-<slug>@test.com`) to avoid conflicts
- Read exact endpoint paths and field names from the API source code — never guess
- Amount field must be passed as string (e.g., `"500"` not `500`)
