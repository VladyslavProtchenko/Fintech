# API File Generation Order

Generate files in this exact order. Each file may depend on previous ones.

## 1. Project Config

- `package.json` — workspace deps on all @fintech/* packages (`"workspace:*"`), NestJS deps, Prisma deps, passport deps. Script `start:dev`: `prisma generate && nest start --watch`
- `tsconfig.json` — extends base, rootDir `./src`, incremental false, all @fintech paths to dist/index
- `nest-cli.json` — `{ "compilerOptions": { "builder": "tsc", "deleteOutDir": true } }`

## 2. Prisma

- `prisma/schema.prisma` — User model:
  ```prisma
  datasource db {
    provider = "postgresql"
  }
  generator client {
    provider = "prisma-client-js"
    output   = "../src/generated/prisma"
  }
  model User {
    id              Int      @id @default(autoincrement())
    email           String   @unique
    passwordHash    String
    name            String?
    paymentClientId String?  @unique
    walletId        String?  @unique
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt
  }
  ```
- `prisma.config.ts`:
  ```typescript
  import 'dotenv/config';
  import { defineConfig } from 'prisma/config';
  export default defineConfig({
    datasource: { url: process.env['DATABASE_URL']! },
  });
  ```

## 3. Environment

- `.env` — real values (PAYMENT_API_KEY from payment-service, DATABASE_URL from existing platform)
- `.gitignore` — `src/generated/`, `generated/`, `dist/`, `node_modules/`, `.env`

## 4. Source Files

- `src/config/env.validation.ts` — extend BaseEnvironmentVariables, add JWT_SECRET, PAYMENT_API_URL, PAYMENT_API_KEY, PLATFORM_ID, FRONTEND_URL
- `src/prisma/prisma.module.ts` — Global module
- `src/prisma/prisma.service.ts` — one-line withPrismaAdapterPg mixin
- `src/auth/auth.module.ts` — imports JwtModule.registerAsync, ConfigModule
- `src/auth/auth.controller.ts` — register + login endpoints
- `src/auth/auth.service.ts` — hashPassword on register, comparePassword on login, JWT sign
- `src/auth/dto/` — register DTO, login DTO
- `src/<module>/` — PaymentService bridge (ensurePaymentClient, balance, deposit, transfer, history, mapTransaction)
- `src/<module>/` — Controller with unique endpoint paths
- `src/<module>/dto/` — DTOs with unique field names from strategy
- `src/<module>/types/` — MappedTransaction interface
- `src/user/` (or chosen name) — controller with email search endpoint
- `src/user/` — module
- `src/health/health.controller.ts` — PrismaHealthIndicator with SELECT 1
- `src/health/health.module.ts` — local module with TerminusModule
- `src/common/filters/global-exception.filter.ts` — unique error format from strategy

## 5. App Wiring

- `src/app.module.ts` — ConfigModule.forRoot (with validate), createAuthModule(), AuthModule, PaymentModule, UserModule, HealthModule, PrismaModule
- `src/main.ts` — bootstrap with:
  - `app.setGlobalPrefix(...)` if strategy has endpointPrefix (exclude health)
  - ValidationPipe (whitelist, forbidNonWhitelisted, transform)
  - GlobalExceptionFilter
  - CORS with FRONTEND_URL
  - Swagger on path `'docs'`

## 6. Docker

- `Dockerfile` — multi-stage (see invariants for pattern)

## Reference Code to Study

Before generating, read these files for patterns:
- `platforms/apricot/api/src/` — latest reference implementation
- `packages/payment-sdk/src/` — SDK types (Transaction, Client, Wallet)
- `packages/shared-auth/src/` — exports list
- `packages/shared-prisma/src/` — withPrismaAdapterPg signature
- `packages/shared-config/src/` — BaseEnvironmentVariables fields
