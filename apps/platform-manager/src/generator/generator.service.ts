import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface GeneratedFile {
  path: string; // relative to platforms/<slug>/
  content: string;
}

export interface PlatformTraits {
  endpointStyle: string;
  errorStyle: string;
  colorHue: number;
  colorHex: string;
  fonts: string;
  layout: string;
  terminology: Record<string, string>;
}

export interface GenerationResult {
  traits: PlatformTraits;
  files: GeneratedFile[];
}

const GREENAPPLE_DOCKER_COMPOSE = `
name: greenapple
services:
  greenapple-api:
    build:
      context: ../../          # monorepo root
      dockerfile: platforms/greenapple/api/Dockerfile
    container_name: greenapple-api
    environment:
      NODE_ENV: development
      PORT: 3010
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/greenapple_db
      JWT_SECRET: greenapple-dev-secret-key-minimum-32-chars-required
      JWT_EXPIRES_IN: 7d
      PAYMENT_API_URL: http://payment-service:3004
      PAYMENT_API_KEY: dev-api-key-12345
      PLATFORM_ID: greenapple
      FRONTEND_URL: http://greenapple.localhost
    networks: [caddy, internal]
    labels:
      caddy: "http://greenapple.localhost"
      caddy.handle_path: /api/*
      caddy.handle_path.0_reverse_proxy: "{{upstreams 3010}}"

  greenapple-web:
    build:
      context: ./web           # self-contained web build context
      dockerfile: Dockerfile
    container_name: greenapple-web
    environment:
      API_URL: http://greenapple-api:3010
      NEXT_PUBLIC_APP_NAME: GreenApple
      NEXT_PUBLIC_APP_URL: http://greenapple.localhost
    networks: [caddy, internal]
    labels:
      caddy: "http://greenapple.localhost"
      caddy.handle.0_reverse_proxy: "{{upstreams 3011}}"
    depends_on: [greenapple-api]

networks:
  caddy:
    external: true
  internal:
    driver: bridge
`;

const GREENAPPLE_API_DOCKERFILE = `
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/payment-sdk ./packages/payment-sdk
COPY platforms/greenapple/api ./platforms/greenapple/api
RUN pnpm install --frozen-lockfile
WORKDIR /app/platforms/greenapple/api
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS production
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/platforms/greenapple/api/dist ./platforms/greenapple/api/dist
COPY --from=builder /app/platforms/greenapple/api/src/generated ./platforms/greenapple/api/src/generated
COPY platforms/greenapple/api/package.json ./platforms/greenapple/api/package.json
COPY platforms/greenapple/api/prisma ./platforms/greenapple/api/prisma
COPY platforms/greenapple/api/prisma.config.ts ./platforms/greenapple/api/prisma.config.ts
RUN pnpm install --frozen-lockfile
WORKDIR /app/platforms/greenapple/api
EXPOSE 3010
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
`;

const GREENAPPLE_WEB_DOCKERFILE = `
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3011
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3011
CMD ["node", "server.js"]
`;

@Injectable()
export class GeneratorService {
  private readonly logger = new Logger(GeneratorService.name);
  private readonly anthropic: Anthropic;
  private readonly platformsDir: string;
  private readonly paymentApiKey: string;

  constructor(private readonly config: ConfigService) {
    this.anthropic = new Anthropic({ apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY') });
    this.platformsDir = config.getOrThrow<string>('PLATFORMS_DIR');
    this.paymentApiKey = config.getOrThrow<string>('PAYMENT_API_KEY');
  }

  async generate(params: {
    slug: string;
    displayName: string;
    prompt: string;
    apiPort: number;
    webPort: number;
  }): Promise<GenerationResult> {
    this.logger.log(`Generating platform: ${params.slug} (ports ${params.apiPort}/${params.webPort})`);

    const spec = this.readSpec();
    const registry = this.readRegistry();

    this.logger.log('Calling Claude API — this may take a few minutes...');
    const message = await this.anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 32000,
      system: this.buildSystemPrompt(spec),
      messages: [{ role: 'user', content: this.buildUserPrompt(params, registry) }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude API');

    this.logger.log('Parsing Claude response...');
    const result = this.parseResponse(block.text);

    this.logger.log(`Writing ${result.files.length} files for platform: ${params.slug}`);
    await this.writeFiles(params.slug, result.files);

    this.logger.log(`Generation complete: ${params.slug}`);
    return result;
  }

  async writeFiles(slug: string, files: GeneratedFile[]): Promise<void> {
    const platformDir = path.join(this.platformsDir, slug);

    for (const file of files) {
      const fullPath = path.join(platformDir, file.path);
      const dir = path.dirname(fullPath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(fullPath, file.content, 'utf-8');
      this.logger.debug(`Written: ${file.path}`);
    }
  }

  private readSpec(): string {
    const specPath = path.join(process.cwd(), '../../docs/client-platform-spec.md');
    try {
      return fs.readFileSync(specPath, 'utf-8');
    } catch {
      this.logger.warn('client-platform-spec.md not found, using embedded summary');
      return '(spec not found)';
    }
  }

  private readRegistry(): string {
    const registryPath = path.join(process.cwd(), '../../docs/client-registry.md');
    try {
      return fs.readFileSync(registryPath, 'utf-8');
    } catch {
      return 'No existing platforms.';
    }
  }

  private buildSystemPrompt(spec: string): string {
    return `You are a code generation engine for a white-label fintech payment platform.
Your task is to generate a COMPLETE, production-ready platform pair: NestJS 11 backend + Next.js 16 frontend.

Every generated platform must be UNIQUE in structure, naming, colors, and terminology compared to existing ones.

=== REFERENCE IMPLEMENTATION (greenapple) ===

API Dockerfile pattern (adapt paths for the new slug):
\`\`\`dockerfile
${GREENAPPLE_API_DOCKERFILE.trim()}
\`\`\`

Web Dockerfile (self-contained, no changes needed):
\`\`\`dockerfile
${GREENAPPLE_WEB_DOCKERFILE.trim()}
\`\`\`

docker-compose.yml pattern:
\`\`\`yaml
${GREENAPPLE_DOCKER_COMPOSE.trim()}
\`\`\`

=== FULL SPECIFICATION ===
${spec}
=== END SPECIFICATION ===

CRITICAL BUILD CONSTRAINTS (NEVER VIOLATE):
1. Prisma 7: NO "url" in datasource block — use prisma.config.ts instead
2. Prisma output MUST be inside src/ (e.g., "../src/generated/prisma") — TypeScript rootDir requires this
3. Import Prisma from "generated/prisma/client" (NOT "generated/prisma")
4. PrismaService: use @prisma/adapter-pg + pg.Pool — super({ adapter }) pattern
5. tsconfig: "incremental": false, "rootDir": "./src", paths point to ../../packages/payment-sdk/dist/index
6. nest-cli.json: tsc builder (NOT SWC), "deleteOutDir": true
7. Registration order: createClient() in payment-service FIRST, then local User
8. PaymentClient constructor: { baseUrl, apiKey } — import from @fintech/payment-sdk
9. Never expose payment-service IDs or error structure to frontend

OUTPUT FORMAT:
Respond with ONLY valid JSON — no markdown, no explanation, no code blocks:
{
  "traits": {
    "endpointStyle": "Style X description",
    "errorStyle": "Style X description",
    "colorHue": 210,
    "colorHex": "#3b82f6",
    "fonts": "HeadingFont + BodyFont",
    "layout": "sidebar-left|sidebar-right|top-nav|minimal",
    "terminology": {
      "balance": "Available Balance",
      "deposit": "Add Funds",
      "send": "Transfer",
      "transactions": "History"
    }
  },
  "files": [
    { "path": "api/package.json", "content": "..." },
    { "path": "api/tsconfig.json", "content": "..." },
    { "path": "web/src/app/page.tsx", "content": "..." },
    { "path": "docker-compose.yml", "content": "..." }
  ]
}

All "path" values are relative to the platform root directory (e.g., "api/src/main.ts").`;
  }

  private buildUserPrompt(
    params: { slug: string; displayName: string; prompt: string; apiPort: number; webPort: number },
    registry: string,
  ): string {
    return `Generate a complete white-label payment platform:

PLATFORM DETAILS:
- slug: ${params.slug}
- displayName: "${params.displayName}"
- description: ${params.prompt}
- apiPort: ${params.apiPort}
- webPort: ${params.webPort}
- PLATFORM_ID: ${params.slug}
- paymentApiKey: ${this.paymentApiKey}
- databaseName: ${params.slug}_db

EXISTING PLATFORMS (pick DIFFERENT traits — color hue must differ by 30+ degrees from all listed):
${registry}

REQUIRED FILES:
Backend (api/):
- package.json
- tsconfig.json
- nest-cli.json
- prisma.config.ts
- prisma/schema.prisma
- src/main.ts
- src/app.module.ts
- src/config/env.validation.ts
- src/prisma/prisma.module.ts
- src/prisma/prisma.service.ts
- src/auth/auth.module.ts
- src/auth/auth.controller.ts
- src/auth/auth.service.ts
- src/auth/jwt.strategy.ts
- src/auth/guards/jwt-auth.guard.ts
- src/auth/decorators/current-user.decorator.ts
- src/auth/dto/register.dto.ts
- src/auth/dto/login.dto.ts
- src/auth/types/jwt-payload.ts
- src/<paymentModule>/<paymentModule>.module.ts
- src/<paymentModule>/<paymentModule>.service.ts
- src/<paymentModule>/<paymentModule>.controller.ts
- src/<paymentModule>/dto/deposit.dto.ts
- src/<paymentModule>/dto/transfer.dto.ts
- src/<userModule>/<userModule>.module.ts
- src/<userModule>/<userModule>.service.ts
- src/<userModule>/<userModule>.controller.ts
- src/health/health.module.ts
- src/health/health.controller.ts
- src/common/filters/global-exception.filter.ts
- .gitignore
- Dockerfile

Frontend (web/):
- package.json
- tsconfig.json
- next.config.ts (with output: 'standalone')
- tailwind.config.ts
- .gitignore
- .dockerignore
- public/logo.svg (icon + wordmark, 180x40 viewBox, single primary color)
- public/favicon.svg (icon only, 32x32 viewBox)
- src/lib/api.ts (server-side fetch with cookies, server-only)
- src/lib/errors.ts (ApiError class matching backend error format)
- src/actions/auth.ts (login, register, logout server actions)
- src/actions/payment.ts (deposit, transfer with revalidatePath)
- src/actions/user.ts (searchUser server action)
- src/app/layout.tsx (metadata, favicon, fonts)
- src/app/page.tsx (landing page styled for the platform theme)
- src/app/(auth)/login/page.tsx
- src/app/(auth)/register/page.tsx
- src/components/forms/login-form.tsx (useActionState pattern)
- src/components/forms/register-form.tsx (useActionState pattern)
- src/app/(dashboard)/layout.tsx (auth guard: check cookie, redirect if missing)
- src/app/(dashboard)/dashboard/page.tsx (Server Component: balance + recent transactions)
- src/app/(dashboard)/deposit/page.tsx
- src/components/forms/deposit-form.tsx (useActionState pattern)
- src/app/(dashboard)/send/page.tsx
- src/components/forms/send-form.tsx (useActionState, multi-step: email lookup → amount → confirm)
- src/app/(dashboard)/history/page.tsx (Server Component, searchParams pagination)
- src/components/ui/button.tsx
- src/components/ui/input.tsx
- src/components/ui/card.tsx
- src/components/ui/badge.tsx
- Dockerfile

Infrastructure:
- docker-compose.yml

ENVIRONMENT VALUES FOR .env files:
- DATABASE_URL: postgresql://postgres:postgres@postgres:5432/${params.slug}_db
- PAYMENT_API_URL (in Docker): http://payment-service:3004
- PAYMENT_API_KEY: ${this.paymentApiKey}
- API_URL (for web in Docker): http://${params.slug}-api:${params.apiPort}
- NEXT_PUBLIC_APP_URL: http://${params.slug}.localhost

The visual design and theme should match the platform description: "${params.prompt}"

Generate the complete platform now. Output ONLY valid JSON.`;
  }

  private parseResponse(text: string): GenerationResult {
    // Strip any accidental markdown wrapping
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    // Try direct parse first
    try {
      return JSON.parse(cleaned) as GenerationResult;
    } catch {
      // Fall back: extract the outermost JSON object
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) {
        throw new Error('No valid JSON object found in Claude response');
      }
      return JSON.parse(cleaned.slice(start, end + 1)) as GenerationResult;
    }
  }
}
