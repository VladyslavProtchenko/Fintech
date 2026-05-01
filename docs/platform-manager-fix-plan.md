# Platform Manager — Fix Plan

## Problem

Platform Manager currently tries to call Anthropic API (`GeneratorService`) to generate platform code at runtime.
This is wrong. Code generation is done by Claude Code using the `create-client-platform` skill.
Platform Manager's job is **deployment only**: take already-generated files and deploy them via Docker + Caddy.

## Current Flow (BROKEN)

```
POST /platforms { slug, prompt }
  -> GeneratorService calls Anthropic API (needs ANTHROPIC_API_KEY)
  -> writes files to platforms/<slug>/
  -> allocates unique ports
  -> docker compose build + up
  -> returns siteUrl
```

## Target Flow (CORRECT)

```
1. User talks to Claude Code: "create a payment site for citrus company"
2. Claude Code runs create-client-platform skill
   -> generates files in platforms/<slug>/ (api/, web/, docker-compose.yml)
   -> updates docs/client-registry.md
3. Claude Code (or user) calls: POST /platforms { slug: "citrus" }
4. Platform Manager deploys:
   -> validates platforms/<slug>/docker-compose.yml exists
   -> sets status BUILDING
   -> runs pnpm install (updates lockfile for new workspace member)
   -> creates database <slug>_db
   -> docker compose build
   -> ensures caddy network exists
   -> docker compose up -d
   -> sets status RUNNING
   -> returns { siteUrl, swaggerUrl }
5. Caddy auto-detects containers via labels -> <slug>.pay works
```

---

## Step 1 — Delete GeneratorService

### Why
GeneratorService calls Anthropic API. We don't need API calls — Claude Code generates code via skills.

### Files to delete
- `apps/platform-manager/src/generator/generator.service.ts`
- `apps/platform-manager/src/generator/generator.module.ts`

### Files to update

**`apps/platform-manager/src/platforms/platforms.module.ts`**
Remove `GeneratorModule` import:
```typescript
// BEFORE
import { GeneratorModule } from '../generator/generator.module';
@Module({
  imports: [GeneratorModule, DockerModule],
  ...
})

// AFTER
@Module({
  imports: [DockerModule],
  ...
})
```

**`apps/platform-manager/src/platforms/platforms.service.ts`**
Remove:
- `import { GeneratorService, PlatformTraits } from '../generator/generator.service'`
- `private readonly generator: GeneratorService` from constructor
- All references to `this.generator`

---

## Step 2 — Remove ANTHROPIC_API_KEY from config

### Why
No API calls = no API key needed.

### Files to update

**`apps/platform-manager/src/config/env.validation.ts`**
Remove the `ANTHROPIC_API_KEY` field from `EnvVariables` class.

**`apps/platform-manager/.env`**
Remove the line `ANTHROPIC_API_KEY=`.

**`apps/platform-manager/.env.example`**
Remove `ANTHROPIC_API_KEY` entry.

**`apps/platform-manager/package.json`**
Remove `@anthropic-ai/sdk` from dependencies.

---

## Step 3 — Simplify Prisma schema

### Why
- `prompt` field — not needed, platform-manager doesn't know the prompt (skill handles it)
- `apiPort` / `webPort` — not needed, ports are in docker-compose.yml, managed by the skill

### Current schema
```prisma
model Platform {
  id          String         @id @default(uuid())
  slug        String         @unique
  domain      String         @unique
  displayName String
  prompt      String           # REMOVE
  apiPort     Int?           @unique  # REMOVE
  webPort     Int?           @unique  # REMOVE
  status      PlatformStatus @default(CREATING)
  siteUrl     String?
  errorMsg    String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}
```

### Target schema
```prisma
model Platform {
  id          String         @id @default(uuid())
  slug        String         @unique
  domain      String         @unique
  displayName String
  status      PlatformStatus @default(CREATING)
  siteUrl     String?
  errorMsg    String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}
```

### Migration
```bash
cd apps/platform-manager
DATABASE_URL=postgresql://Vladyslav@localhost:5432/platform_manager npx prisma migrate dev --name remove_prompt_and_ports
```

---

## Step 4 — Simplify CreatePlatformDto

### Why
Platform-manager only needs `slug` to deploy. Display name and domain are optional.
`prompt` is removed — code generation is not platform-manager's job.

### Current DTO
```typescript
export class CreatePlatformDto {
  slug!: string;        // required
  displayName?: string; // optional
  prompt!: string;      // required - REMOVE
  domain?: string;      // optional
}
```

### Target DTO
```typescript
export class CreatePlatformDto {
  @ApiProperty({ example: 'citrus' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'slug must be lowercase alphanumeric with optional hyphens',
  })
  slug!: string;

  @ApiPropertyOptional({ example: 'Citrus Pay' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ example: 'citrus.pay' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9.-]+$/, {
    message: 'domain must be lowercase letters, numbers, dots, hyphens',
  })
  domain?: string;
}
```

---

## Step 5 — Rewrite deploy() pipeline

### Why
Remove generator call, port allocation, and registry update.
Add file existence validation before deploying.

### Current deploy() steps
```
1. allocatePorts()           # REMOVE
2. generator.generate()      # REMOVE
3. runPnpmInstall()          # KEEP
4. docker.build()            # KEEP
5. createDatabase()          # KEEP
6. docker.ensureNetwork()    # KEEP
7. docker.up()               # KEEP
8. update DB -> RUNNING      # KEEP (add swaggerUrl)
9. updateRegistry()          # REMOVE
```

### Target deploy() pipeline
```typescript
private async deploy(platform: Platform): Promise<void> {
  try {
    // 1. Verify generated files exist
    const platformDir = path.join(this.platformsDir, platform.slug);
    await this.validatePlatformFiles(platformDir);

    // 2. Set status to BUILDING
    await this.prisma.platform.update({
      where: { id: platform.id },
      data: { status: 'BUILDING' },
    });

    // 3. Update pnpm lockfile (new workspace member)
    this.logger.log(`[${platform.slug}] running pnpm install...`);
    await this.runPnpmInstall();

    // 4. Create database if it doesn't exist
    this.logger.log(`[${platform.slug}] ensuring database exists...`);
    await this.createDatabase(platform.slug);

    // 5. Build docker images
    this.logger.log(`[${platform.slug}] building docker images...`);
    await this.docker.build(platformDir);

    // 6. Ensure caddy network exists
    await this.docker.ensureNetwork('caddy');

    // 7. Start containers
    this.logger.log(`[${platform.slug}] starting containers...`);
    await this.docker.up(platformDir);

    // 8. Mark RUNNING with URLs
    await this.prisma.platform.update({
      where: { id: platform.id },
      data: {
        status: 'RUNNING',
        siteUrl: `http://${platform.domain}`,
      },
    });

    this.logger.log(`[${platform.slug}] deploy complete`);
  } catch (err) {
    this.logger.error(`[${platform.slug}] deploy failed: ${String(err)}`);
    try {
      await this.prisma.platform.update({
        where: { id: platform.id },
        data: { status: 'FAILED', errorMsg: String(err) },
      });
    } catch (dbErr) {
      this.logger.error(`[${platform.slug}] failed to persist FAILED status: ${String(dbErr)}`);
    }
  }
}
```

### New method: validatePlatformFiles()
```typescript
private async validatePlatformFiles(platformDir: string): Promise<void> {
  const composePath = path.join(platformDir, 'docker-compose.yml');
  try {
    await fs.promises.access(composePath);
  } catch {
    throw new Error(
      `Platform files not found at ${platformDir}. ` +
      `Run the create-client-platform skill first to generate the code.`,
    );
  }
}
```

### Methods to DELETE
- `allocatePorts()` — entire method
- `updateRegistry()` — entire method
- `BASE_API_PORT` constant

### Methods to KEEP
- `runPnpmInstall()`
- `createDatabase()`
- `toDisplayName()`
- `create()`, `findAll()`, `findOne()`, `getStatus()`, `stop()`, `start()`, `retry()`

---

## Step 6 — Update create() method

### Why
Remove `prompt` from the data being saved.

### Current
```typescript
const platform = await this.prisma.platform.create({
  data: { slug: dto.slug, domain, displayName, prompt: dto.prompt, status: 'CREATING' },
});
```

### Target
```typescript
const platform = await this.prisma.platform.create({
  data: { slug: dto.slug, domain, displayName, status: 'CREATING' },
});
```

---

## Step 7 — Update getStatus() response

### Why
Add `swaggerUrl` — derived from `siteUrl`, not stored in DB.

### Target
```typescript
async getStatus(slug: string) {
  const platform = await this.prisma.platform.findUnique({
    where: { slug },
    select: { status: true, siteUrl: true, errorMsg: true },
  });
  if (!platform) throw new NotFoundException(`Platform "${slug}" not found`);
  return {
    ...platform,
    swaggerUrl: platform.siteUrl ? `${platform.siteUrl}/api/docs` : null,
  };
}
```

---

## Step 8 — Update frontend (platform-manager-web)

### Why
Frontend references `prompt`, `apiPort`, `webPort` which will be removed from the API.

### Files to update

**`src/lib/types.ts`** — remove `prompt`, `apiPort`, `webPort`:
```typescript
export interface Platform {
  id: string;
  slug: string;
  domain: string;
  displayName: string;
  status: PlatformStatus;
  siteUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**`src/actions/platforms.ts`** — remove `prompt` from `createPlatform`:
```typescript
export async function createPlatform(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const slug = formData.get('slug') as string;
  const displayName = (formData.get('displayName') as string) || undefined;
  const domain = (formData.get('domain') as string) || undefined;

  try {
    await api.platforms.create({ slug, displayName, domain });
  } catch (err) {
    return err instanceof Error ? err.message : 'Failed to create platform';
  }

  revalidatePath('/platforms');
  redirect('/platforms');
}
```

**`src/lib/api.ts`** — remove `prompt` from create body type:
```typescript
create: (body: { slug: string; displayName?: string; domain?: string }) =>
  apiFetch<Platform>('/platforms', { method: 'POST', body: JSON.stringify(body) }),
```

**`src/components/create-form.tsx`** — remove `prompt` textarea.
The form becomes: slug + displayName + domain only.
Change button text from "Generate Platform" to "Deploy Platform".
Change page description — not "Claude will generate", but "Deploy a pre-generated platform".

**`src/components/platform-card.tsx`** — remove `apiPort`/`webPort` display.
Add `swaggerUrl` link when platform is RUNNING:
```
Site: http://citrus.pay
Swagger: http://citrus.pay/api/docs
```

**`src/app/platforms/new/page.tsx`** — update description text:
```
"Deploy a generated platform. Run the create-client-platform skill first to generate the code."
```

---

## Step 9 — Update create-client-platform skill

### Why
Skill currently generates into `apps/<slug>-api/` + `apps/<slug>-web/`.
Must generate into `platforms/<slug>/api/` + `platforms/<slug>/web/` + `platforms/<slug>/docker-compose.yml`.

### Changes to SKILL.md

**Step 2 — directories:**
```
# BEFORE: Scan apps/ for existing *-api and *-web
# AFTER:  Scan platforms/ for existing directories

ls platforms/
```

**Step 5 — backend path:**
```
# BEFORE: apps/<slug>-api/
# AFTER:  platforms/<slug>/api/
```

**Step 6 — frontend path:**
```
# BEFORE: apps/<slug>-web/
# AFTER:  platforms/<slug>/web/
```

**Step 7 — docker-compose.yml:**
Generate `platforms/<slug>/docker-compose.yml` with Caddy labels.
Already defined in the spec — use the orange platform as reference:
```yaml
name: <slug>
services:
  <slug>-api:
    build:
      context: ../../              # monorepo root
      dockerfile: platforms/<slug>/api/Dockerfile
    container_name: <slug>-api
    environment: ...
    networks: [caddy, internal]
    labels:
      caddy: "http://<slug>.pay"
      caddy.handle_path: /api/*
      caddy.handle_path.0_reverse_proxy: "{{upstreams <apiPort>}}"
  <slug>-web:
    build:
      context: ./web
    container_name: <slug>-web
    environment: ...
    networks: [caddy, internal]
    labels:
      caddy: "http://<slug>.pay"
      caddy.handle.0_reverse_proxy: "{{upstreams <webPort>}}"
networks:
  caddy:
    external: true
  internal:
    driver: bridge
```

**NEW Step (after generation) — trigger deploy:**
After generating all files, call platform-manager to deploy:
```bash
curl -X POST http://localhost:3020/platforms \
  -H 'Content-Type: application/json' \
  -d '{"slug": "<slug>", "displayName": "<name>"}'
```

Or via the platform-manager-web UI: http://localhost:3021/platforms/new

**tsconfig paths — adjust depth:**
Platforms are at `platforms/<slug>/api/`, so paths go 3 levels up:
```json
"@fintech/payment-sdk": ["../../../packages/payment-sdk/dist/index"]
```

---

## Step 10 — Remove unused dependencies

### Why
`@anthropic-ai/sdk` is no longer needed.

```bash
cd apps/platform-manager
pnpm remove @anthropic-ai/sdk
```

---

## Step 11 — Build and test

### Verify compilation
```bash
cd apps/platform-manager
npm run build
```

### Start backend
```bash
cd apps/platform-manager
npm run start:dev
```

Verify:
- http://localhost:3020/health -> `{ "status": "ok" }`
- http://localhost:3020/docs -> Swagger UI

### Start frontend
```bash
cd apps/platform-manager-web
pnpm dev
```

Verify:
- http://localhost:3021/platforms -> Platform list

### End-to-end test with existing platform (orange)

Orange is already deployed and running. Register it in platform-manager:

```bash
curl -X POST http://localhost:3020/platforms \
  -H 'Content-Type: application/json' \
  -d '{"slug": "orange", "displayName": "Orange Pay", "domain": "orange.pay"}'
```

Expected: platform registered, deploy runs, status becomes RUNNING.
Since orange containers are already running, docker compose up is a no-op.

Then verify:
```bash
curl http://localhost:3020/platforms/orange/status
# { "status": "RUNNING", "siteUrl": "http://orange.pay", "swaggerUrl": "http://orange.pay/api/docs" }
```

### Full test with new platform

1. Run skill: `/create-client-platform` with slug `testpay`
2. Verify files: `ls platforms/testpay/` -> `api/ web/ docker-compose.yml`
3. Deploy: `POST /platforms { "slug": "testpay" }`
4. Poll: `GET /platforms/testpay/status` until RUNNING
5. Open: `http://testpay.pay` -> site works
6. Open: `http://testpay.pay/api/docs` -> Swagger works

---

## Summary of file changes

### DELETE
| File | Reason |
|------|--------|
| `src/generator/generator.service.ts` | Anthropic API not needed |
| `src/generator/generator.module.ts` | Anthropic API not needed |

### MODIFY
| File | Change |
|------|--------|
| `src/platforms/platforms.module.ts` | Remove GeneratorModule import |
| `src/platforms/platforms.service.ts` | Remove generator, ports, registry; add validatePlatformFiles(); simplify deploy() |
| `src/platforms/dto/create-platform.dto.ts` | Remove `prompt` field |
| `src/config/env.validation.ts` | Remove `ANTHROPIC_API_KEY` |
| `prisma/schema.prisma` | Remove `prompt`, `apiPort`, `webPort` |
| `package.json` | Remove `@anthropic-ai/sdk` |
| `.env` | Remove `ANTHROPIC_API_KEY` |
| `.env.example` | Remove `ANTHROPIC_API_KEY` |
| `(web) src/lib/types.ts` | Remove `prompt`, `apiPort`, `webPort` |
| `(web) src/lib/api.ts` | Remove `prompt` from create body |
| `(web) src/actions/platforms.ts` | Remove `prompt` handling |
| `(web) src/components/create-form.tsx` | Remove prompt textarea, update labels |
| `(web) src/components/platform-card.tsx` | Remove ports, add swagger link |
| `(web) src/app/platforms/new/page.tsx` | Update description text |
| `.claude/skills/create-client-platform/SKILL.md` | Generate to `platforms/` not `apps/`; add deploy step |

### CREATE
| File | Content |
|------|---------|
| `prisma/migrations/<timestamp>_simplify_schema/` | Auto-generated by prisma migrate dev |
