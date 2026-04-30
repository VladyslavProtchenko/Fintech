# Platform Manager — Implementation Plan

## Goal

One prompt in → two links out.

```
POST /platforms
{ "prompt": "payment site for Valencia citrus company", "slug": "citrus", "domain": "citrus.localhost" }

→ { "site": "http://citrus.localhost", "swagger": "http://citrus.localhost/api/docs" }
```

The service automatically generates code, builds Docker images, starts containers, and registers the domain in Caddy.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  platform-manager                    │
│                  (NestJS, port 3020)                 │
│                                                      │
│  POST /platforms ──► GeneratorService                │
│                         │ calls Claude API           │
│                         ↓                            │
│                      writes files to                 │
│                      platforms/<slug>/               │
│                         │                            │
│                         ↓                            │
│                      DockerService                   │
│                         │ runs docker compose up     │
│                         ↓                            │
│                      CaddyService                    │
│                         │ POST /config/ Admin API    │
│                         ↓                            │
│                   returns { site, swagger }          │
└─────────────────────────────────────────────────────┘
         │                              │
         ↓                              ↓
  platforms/<slug>/              Caddy (port 80)
    api/ (NestJS)                  ↕ Admin API :2019
    web/ (Next.js)                citrus.localhost → citrus-web:3000
    docker-compose.yml            orange.localhost → orange-web:3000
```

---

## Repository Structure After Migration

```
fintech/
├── apps/
│   ├── platform-manager/     ← NEW: orchestration service
│   ├── payment-service/      (unchanged)
│   ├── otp-service/          (unchanged)
│   └── photo-service/        (unchanged)
│
├── platforms/                ← NEW: generated client platforms
│   ├── greenapple/           (moved from apps/greenapple-api + apps/greenapple-web)
│   │   ├── api/
│   │   ├── web/
│   │   └── docker-compose.yml
│   └── orange/               (moved from apps/orange-api + apps/orange-web)
│       ├── api/
│       ├── web/
│       └── docker-compose.yml
│
├── packages/
│   └── payment-sdk/
│
├── caddy/                    ← NEW: Caddy config and data
│   └── Caddyfile
│
└── docker-compose.yml        (root: postgres, redis, caddy, platform-manager)
```

---

## Step 1 — Delete brand-service and brand-web

```bash
rm -rf apps/brand-service
rm -rf apps/brand-web
```

Remove their entries from `docker-compose.yml` if present.

---

## Step 2 — Migrate Existing Platforms

Move `apps/greenapple-api` → `platforms/greenapple/api`
Move `apps/greenapple-web` → `platforms/greenapple/web`
Move `apps/orange-api`     → `platforms/orange/api`
Move `apps/orange-web`     → `platforms/orange/web`

Create `platforms/greenapple/docker-compose.yml`:

```yaml
name: greenapple

services:
  greenapple-api:
    build: ./api
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      PAYMENT_API_URL: ${PAYMENT_API_URL}
      PAYMENT_API_KEY: ${PAYMENT_API_KEY}
      PLATFORM_ID: greenapple
      FRONTEND_URL: http://greenapple.localhost
    networks:
      - caddy
      - internal
    labels:
      caddy: greenapple.localhost
      caddy.handle_path: /api/*
      caddy.handle_path.0_reverse_proxy: "{{upstreams 3000}}"
      caddy.tls: "off"

  greenapple-web:
    build: ./web
    environment:
      API_URL: http://greenapple-api:3000
      NEXT_PUBLIC_APP_URL: http://greenapple.localhost
    networks:
      - caddy
      - internal
    labels:
      caddy: greenapple.localhost
      caddy.reverse_proxy: "{{upstreams 3000}}"
      caddy.tls: "off"

networks:
  caddy:
    external: true
  internal:
```

> **Note on routing:** `greenapple.localhost` → web, `greenapple.localhost/api/*` → api (path prefix stripped before forwarding).

Update `pnpm-workspace.yaml` to include `platforms/*/api` and `platforms/*/web`.

---

## Step 3 — Caddy Setup

### Why Caddy Docker Proxy

Instead of calling Caddy Admin API manually, we use **caddy-docker-proxy** plugin.
It watches Docker for new containers with `caddy.*` labels and auto-configures routing — zero code needed for routing itself.

- Source: https://github.com/lucaslorentz/caddy-docker-proxy
- Works by watching Docker socket for label changes
- Generates Caddyfile dynamically, reloads Caddy automatically

### Root docker-compose.yml (caddy + infrastructure)

```yaml
services:
  caddy:
    image: lucaslorentz/caddy-docker-proxy:2.9-alpine
    ports:
      - "80:80"
      - "443:443"
      - "2019:2019"    # Admin API (for platform-manager to query status)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - caddy_data:/data
    networks:
      - caddy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    # ... (unchanged)
    networks:
      - caddy

  platform-manager:
    build:
      context: .
      dockerfile: apps/platform-manager/Dockerfile
    ports:
      - "3020:3020"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # needs Docker socket
      - ./platforms:/app/platforms                  # write generated files
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/platform_manager
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      PAYMENT_API_URL: http://payment-service:3004
      PAYMENT_API_KEY: ${PAYMENT_API_KEY}
      PLATFORMS_DIR: /app/platforms
      CADDY_ADMIN_URL: http://caddy:2019
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - caddy

networks:
  caddy:
    external: true
```

> **Important:** Create the shared Docker network first: `docker network create caddy --ipv6`
> (флаг `--ipv6` нужен чтобы Caddy видел реальные клиентские IP, а не Docker gateway)

### Local domains

`*.localhost` resolves to `127.0.0.1` automatically in Chrome, Firefox, Safari — no `/etc/hosts` needed.

Format: `<slug>.localhost` for web, `<slug>.localhost/api` for backend.

---

## Step 4 — platform-manager Service

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 |
| DB | PostgreSQL + Prisma 7 |
| Code gen | Anthropic SDK (claude-sonnet-4-6) |
| Docker | child_process (docker compose) |
| Caddy | Caddy Docker Proxy labels (auto) |
| Config | @nestjs/config + class-validator |

### Database Schema

```prisma
model Platform {
  id        String         @id @default(uuid())
  slug      String         @unique
  domain    String         @unique
  prompt    String
  status    PlatformStatus @default(CREATING)
  siteUrl   String?
  swaggerUrl String?
  errorMsg  String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
}

enum PlatformStatus {
  CREATING    // code generation in progress
  BUILDING    // docker compose build running
  RUNNING     // containers up and healthy
  STOPPED     // containers stopped
  FAILED      // error during any step
}
```

### API Endpoints

```
POST   /platforms          Create new platform (async, returns immediately with id + status)
GET    /platforms          List all platforms with status + URLs
GET    /platforms/:slug    Get single platform details
DELETE /platforms/:slug    Stop + remove containers (keep code)
POST   /platforms/:slug/start   Start stopped platform
POST   /platforms/:slug/stop    Stop running platform
GET    /health
```

### POST /platforms Request/Response

**Request:**
```json
{
  "prompt": "payment site for Valencia citrus company, sells fresh oranges",
  "slug": "citrus",
  "domain": "citrus.localhost"    // optional, defaults to <slug>.localhost
}
```

**Response (immediate, 202 Accepted):**
```json
{
  "id": "uuid",
  "slug": "citrus",
  "domain": "citrus.localhost",
  "status": "CREATING",
  "createdAt": "2026-04-30T..."
}
```

**GET /platforms/:slug (after completion):**
```json
{
  "slug": "citrus",
  "domain": "citrus.localhost",
  "status": "RUNNING",
  "siteUrl": "http://citrus.localhost",
  "swaggerUrl": "http://citrus.localhost/api/docs"
}
```

> **Why async (202)?** Docker build takes 2-5 minutes. Client polls `GET /platforms/:slug` or receives SSE updates.

### Module Structure

```
apps/platform-manager/src/
├── app.module.ts
├── main.ts
├── config/
│   └── env.validation.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── platforms/
│   ├── platforms.module.ts
│   ├── platforms.controller.ts
│   ├── platforms.service.ts      ← orchestrates all steps
│   └── dto/
│       ├── create-platform.dto.ts
│       └── platform-response.dto.ts
├── generator/
│   ├── generator.module.ts
│   └── generator.service.ts      ← calls Claude API, writes files
├── docker/
│   ├── docker.module.ts
│   └── docker.service.ts         ← runs docker compose
├── health/
│   ├── health.module.ts
│   └── health.controller.ts
└── common/
    └── filters/
        └── global-exception.filter.ts
```

---

## Step 5 — Code Generator (generator.service.ts)

### How It Works

1. Reads `docs/client-platform-spec.md` as system context
2. Reads file tree of an existing platform (e.g. `platforms/orange/`) as reference
3. Calls Claude API with tool_use — Claude returns all files as structured JSON
4. Writes each file to `platforms/<slug>/`
5. Writes `platforms/<slug>/docker-compose.yml` with Caddy labels

### Claude API Call Structure

```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 16000,
  tools: [
    {
      name: 'create_platform_files',
      description: 'Create all files for a new payment platform',
      input_schema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },   // e.g. "api/src/main.ts"
                content: { type: 'string' }
              },
              required: ['path', 'content']
            }
          },
          traits: {
            type: 'object',
            properties: {
              primaryColor: { type: 'string' },
              fonts: { type: 'string' },
              layout: { type: 'string' },
              endpoints: { type: 'string' },
              terminology: { type: 'string' }
            }
          }
        },
        required: ['files', 'traits']
      }
    }
  ],
  tool_choice: { type: 'tool', name: 'create_platform_files' },
  messages: [
    {
      role: 'user',
      content: buildPrompt(slug, domain, userPrompt, specContent, registryContent)
    }
  ],
  system: SYSTEM_PROMPT  // contains full client-platform-spec.md
});
```

### System Prompt Content

```
You are a code generator for white-label payment platforms.
Generate a complete NestJS + Next.js platform following the specification below.

RULES:
- Every platform MUST be visually and structurally unique
- Read the client registry to avoid duplicate colors, layouts, endpoints
- Use the provided slug, domain, and user description to create a thematically consistent design
- Return ALL files via the create_platform_files tool
- Include: api/ (NestJS), web/ (Next.js), docker-compose.yml

SPECIFICATION:
<contents of docs/client-platform-spec.md>

EXISTING CLIENTS REGISTRY:
<contents of docs/client-registry.md>

REFERENCE IMPLEMENTATION:
<file tree of platforms/orange/ with key file contents>
```

### File Writing

```typescript
for (const file of toolInput.files) {
  const fullPath = path.join(platformsDir, slug, file.path);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file.content, 'utf-8');
}
```

---

## Step 6 — Docker Service (docker.service.ts)

### Approach

Use Node.js `child_process.exec` to run `docker compose` commands directly.
Simpler than dockerode-compose, works with standard docker-compose.yml format.

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async build(slug: string): Promise<void> {
  const dir = path.join(this.platformsDir, slug);
  await execAsync(`docker compose build`, { cwd: dir });
}

async up(slug: string): Promise<void> {
  const dir = path.join(this.platformsDir, slug);
  await execAsync(`docker compose up -d`, { cwd: dir });
}

async down(slug: string): Promise<void> {
  const dir = path.join(this.platformsDir, slug);
  await execAsync(`docker compose down`, { cwd: dir });
}

async isHealthy(slug: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${slug}-api:${port}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
```

### Docker Compose Template for Generated Platforms

Each generated `platforms/<slug>/docker-compose.yml`:

```yaml
name: <slug>

services:
  <slug>-api:
    build: ./api
    container_name: <slug>-api
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/<slug>_db
      JWT_SECRET: <generated-secret>
      PAYMENT_API_URL: http://payment-service:3004
      PAYMENT_API_KEY: <from-payment-service-env>
      PLATFORM_ID: <slug>
      FRONTEND_URL: http://<slug>.localhost
    networks:
      - caddy
      - internal
    labels:
      caddy: "<slug>.localhost"
      caddy.handle_path: "/api/*"
      caddy.handle_path.0_reverse_proxy: "{{upstreams 3000}}"
      caddy.tls: "off"

  <slug>-web:
    build: ./web
    container_name: <slug>-web
    environment:
      API_URL: http://<slug>-api:3000
      NEXT_PUBLIC_APP_URL: http://<slug>.localhost
    networks:
      - caddy
      - internal
    labels:
      caddy: "<slug>.localhost"
      caddy.reverse_proxy: "{{upstreams 3000}}"
      caddy.tls: "off"

networks:
  caddy:
    external: true
  internal:
```

---

## Step 7 — Full Orchestration Flow (platforms.service.ts)

```typescript
async create(dto: CreatePlatformDto): Promise<Platform> {
  // 1. Save to DB with CREATING status
  const platform = await this.prisma.platform.create({
    data: { slug: dto.slug, domain: dto.domain, prompt: dto.prompt, status: 'CREATING' }
  });

  // 2. Run async (don't await — return 202 immediately)
  this.deploy(platform).catch(err => this.markFailed(platform.id, err.message));

  return platform;
}

private async deploy(platform: Platform): Promise<void> {
  // Step 1: Generate code
  await this.setStatus(platform.id, 'CREATING');
  await this.generator.generate(platform.slug, platform.domain, platform.prompt);

  // Step 2: Create DB in postgres
  await this.createDatabase(platform.slug);

  // Step 3: Run prisma migrate
  await this.docker.runMigration(platform.slug);

  // Step 4: Build + start containers
  await this.setStatus(platform.id, 'BUILDING');
  await this.docker.build(platform.slug);
  await this.docker.up(platform.slug);

  // Step 5: Wait for health check (up to 60s)
  await this.waitForHealth(platform.slug);

  // Step 6: Update DB with RUNNING + URLs
  await this.prisma.platform.update({
    where: { id: platform.id },
    data: {
      status: 'RUNNING',
      siteUrl: `http://${platform.domain}`,
      swaggerUrl: `http://${platform.domain}/api/docs`,
    }
  });
}
```

---

## Step 8 — Database Auto-Creation

Before running migrations, platform-manager creates the DB:

```typescript
async createDatabase(slug: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [`${slug}_db`]
  );
  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${slug}_db"`);
  }
  await client.end();
}
```

Then run migration from within the container:

```typescript
async runMigration(slug: string): Promise<void> {
  const dir = path.join(this.platformsDir, slug);
  await execAsync(
    `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${slug}_db npx prisma migrate deploy`,
    { cwd: path.join(dir, 'api') }
  );
}
```

---

## Step 9 — Status Polling (SSE optional)

Client polls status after receiving 202:

```typescript
// Simple polling approach
while (true) {
  const res = await fetch('/platforms/citrus');
  const { status, siteUrl, swaggerUrl } = await res.json();
  if (status === 'RUNNING') return { siteUrl, swaggerUrl };
  if (status === 'FAILED') throw new Error('Deploy failed');
  await sleep(3000);
}
```

Or optional SSE endpoint: `GET /platforms/:slug/events` — streams status updates.

---

## Step 10 — Update create-client-platform Skill

After platform-manager is built, update the skill to use it:

```
Old flow: Claude Code generates files manually step by step
New flow: POST /platforms → platform-manager handles everything
```

New skill becomes a simple one-liner:
```typescript
const result = await fetch('http://localhost:3020/platforms', {
  method: 'POST',
  body: JSON.stringify({ prompt, slug, domain: `${slug}.localhost` })
});
const { siteUrl, swaggerUrl } = await result.json();
```

---

## Implementation Order

| # | Task | Notes |
|---|------|-------|
| 1 | Delete brand-service + brand-web | `rm -rf` |
| 2 | Move greenapple + orange to `platforms/` | Update pnpm-workspace.yaml |
| 3 | Create shared Caddy network + docker-compose updates | `docker network create caddy` |
| 4 | Setup Caddy Docker Proxy in root docker-compose.yml | Test with existing platforms |
| 5 | Create platform-manager NestJS skeleton | Port 3020, Prisma, health |
| 6 | Implement GeneratorService (Claude API → files) | Core of the system |
| 7 | Implement DockerService (build + up + migration) | child_process wrapper |
| 8 | Implement PlatformsService (orchestration) | Async deploy flow |
| 9 | Wire up REST API (controller + DTOs) | 202 + polling |
| 10 | End-to-end test: one prompt → two URLs | Manual verification |
| 11 | Update create-client-platform skill | Use API instead of manual generation |

---

## Environment Variables (platform-manager)

```env
NODE_ENV=development
PORT=3020
DATABASE_URL=postgresql://Vladyslav@localhost:5432/platform_manager
ANTHROPIC_API_KEY=<your-key>
PAYMENT_API_URL=http://localhost:3004
PAYMENT_API_KEY=dev-api-key-12345
PLATFORMS_DIR=../../platforms
CADDY_ADMIN_URL=http://localhost:2019
```

---

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Caddy routing | caddy-docker-proxy labels | Zero code, auto-detects new containers |
| Docker management | child_process exec | Simpler than dockerode-compose, works natively |
| Code generation | Claude API tool_use | Structured output, all files in one call |
| API style | Async 202 + polling | Build takes 2-5 min, can't block HTTP |
| Domains (local) | `<slug>.localhost` | Works in all browsers without DNS config |
| TLS (local) | disabled (`caddy.tls: off`) | No cert setup needed for local dev |
| File storage | `platforms/<slug>/` in repo | Simple, version-controllable, visible |
