---
name: Platform Deploy
description: >
  This skill should be used when the user asks to "deploy platform",
  "launch platform", "start platform containers", "build and run platform",
  or as the fifth and final step in the platform generation pipeline after
  platform-web. Handles Docker configuration, TypeScript compilation,
  deployment, and returns live site URLs.
---

# Platform Deploy

Create Docker infrastructure, verify TypeScript compilation, deploy the platform, and return working URLs. This is the MANDATORY final step — the task is NOT complete until the site is live.

## Input

From conversation context:
- Strategy from platform-research (slug, displayName, ports, paymentApiKey)
- Generated API at `platforms/<slug>/api/`
- Generated Web at `platforms/<slug>/web/`

## Workflow

### Step 1 — Generate docker-compose.yml

Create `platforms/<slug>/docker-compose.yml`. Read `platforms/apricot/docker-compose.yml` as reference.

```yaml
name: <slug>

services:
  <slug>-api:
    build:
      context: ../../
      dockerfile: platforms/<slug>/api/Dockerfile
    container_name: <slug>-api
    environment:
      NODE_ENV: development
      PORT: <apiPort>
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/<slug>_db
      JWT_SECRET: <slug>-dev-secret-32chars-minimum-required
      JWT_EXPIRES_IN: 7d
      PAYMENT_API_URL: http://payment-service:3004
      PAYMENT_API_KEY: <paymentApiKey from strategy>
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

### Step 2 — Update Infrastructure Files

- Add `CREATE DATABASE <slug>_db;` to `docker/postgres/init.sql`
- Add row to `docs/client-registry.md` with all platform traits

### Step 3 — Install & Compile

```bash
pnpm install

# Build shared packages (dist/ must exist before API compiles)
pnpm --filter @fintech/shared-config run build
pnpm --filter @fintech/payment-sdk run build
pnpm --filter @fintech/shared-auth run build
pnpm --filter @fintech/shared-prisma run build
pnpm --filter @fintech/shared-health run build

# Generate Prisma client
cd platforms/<slug>/api && npx prisma generate

# Check TypeScript compilation
cd platforms/<slug>/api && npx tsc --noEmit
```

If compilation fails — fix errors before proceeding. Common issues:
- Missing import → add it
- Type mismatch → fix the type
- Path resolution → check tsconfig paths point to dist/index

### Step 4 — Deploy

**Option A — platform-manager (preferred):**
```bash
curl -X POST http://localhost:3020/platforms \
  -H 'Content-Type: application/json' \
  -d '{"slug": "<slug>", "displayName": "<displayName>"}'
```

Poll status:
```bash
curl http://localhost:3020/platforms/<slug>/status
```

If build hangs for more than 3 minutes → fall back to Option B.

**Option B — manual Docker (fallback):**
```bash
cd platforms/<slug>
docker compose build
docker compose up -d
```

### Step 5 — Health Checks

Verify all endpoints respond:
```bash
curl -s http://<slug>.localhost/api/health -o /dev/null -w "%{http_code}"    # expect 200
curl -s http://<slug>.localhost -o /dev/null -w "%{http_code}"               # expect 200
curl -s http://<slug>.localhost/api/docs -o /dev/null -w "%{http_code}"      # expect 200
```

If health check fails:
- Check container logs: `docker logs <slug>-api` / `docker logs <slug>-web`
- Fix the issue and rebuild

### Step 6 — Return Result (REQUIRED)

After deployment succeeds, respond with:

- **Site:** `http://<slug>.localhost`
- **Swagger:** `http://<slug>.localhost/api/docs`

## Rules

- This step is MANDATORY — never skip it
- Task is NOT complete until both URLs return 200
- DATABASE_URL uses `postgres` container hostname (Docker network)
- PAYMENT_API_URL uses `payment-service` container hostname
- Network `caddy` must be external (already exists from root docker-compose)
- Swagger path in backend is `'docs'` — Caddy strips `/api/` so public URL = `/api/docs`
