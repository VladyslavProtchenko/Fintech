
Fintech Platform — Monorepo Architecture

Набор self-hosted микросервисов для финтех-операций.
Monorepo на pnpm workspaces + Turborepo. Каждый сервис — независимый деплой.
TypeScript strict, NestJS, PostgreSQL + Prisma, BullMQ + Redis.


1. Структура репозитория

    apps/
    ├── photo-service/      — OCR распознавание чеков (NestJS + BullMQ + Gemini)
    └── otp-service/        — OTP через SMS/WhatsApp/Voice, multi-provider failover

    packages/
    ├── shared-config/      — базовая ENV валидация (class-validator + @Transform)
    ├── shared-logger/      — AppLogger (NestJS LoggerService wrapper)
    ├── shared-errors/      — GlobalExceptionFilter + AppErrors factory
    ├── shared-prisma/      — базовый PrismaService с @prisma/adapter-pg
    ├── shared-redis/       — createRedisModule(), REDIS_CLIENT Symbol token
    ├── shared-queue/       — BullMQ утилиты (общие настройки очередей)
    └── shared-health/      — /health endpoint (Terminus)

    docs/
    └── architecture.md     — этот файл, общая архитектура платформы



2. Общий стек (все сервисы)

    Язык:       TypeScript strict (no any, no as без причины)
    Runtime:    Node.js
    Framework:  NestJS
    DB:         PostgreSQL 16+ via Prisma 7 (adapter-pg, generated client → generated/prisma/)
    Queue:      BullMQ 5 + Redis 7
    Config:     @nestjs/config + class-validator + @Transform для number полей
    Testing:    Jest + Supertest + Testcontainers (реальный PG + Redis в Docker)
    Build:      SWC (via @nestjs/cli)
    Monorepo:   pnpm workspaces + Turborepo


3. Shared Packages

shared-config
- BaseEnvironmentVariables: NODE_ENV, PORT, DATABASE_URL, REDIS_HOST, REDIS_PORT
- createValidator<T>() — обёртка для ConfigModule.forRoot({ validate })
- @Transform() на всех числовых полях — критично для Jest + moduleNameMapper

shared-logger
- AppLogger — NestJS LoggerService с structured JSON логами
- Поля: service, context, requestId, дополнительный payload
- Используется через app.useLogger(app.get(AppLogger))

shared-errors
- GlobalExceptionFilter — перехватывает все исключения, возвращает стандартный JSON
- AppErrors — фабрика типизированных ошибок (otpCooldown, otpRateLimit, ...)

shared-redis
- createRedisModule() — DynamicModule с global: true
- REDIS_CLIENT = Symbol('REDIS_CLIENT') — инжектируется через @Inject(REDIS_CLIENT)
- family: 4 — принудительный IPv4 (Node.js v25+ резолвит localhost → ::1)

shared-prisma
- Базовый PrismaService с PrismaPg адаптером
- Каждый сервис расширяет или использует напрямую

shared-health
- /health endpoint через @nestjs/terminus
- Проверяет PostgreSQL + Redis


4. Сервисы

photo-service (порт 3000)
    OCR распознавание Receipt-чеков.
    POST /upload → BullMQ → PaddleOCR + SuryaOCR (параллельно) → Gemini merge → COMPLETED

    Ключевые детали:
    - SHA-256 dedup до обработки (100% точность)
    - Dual-Check: два движка независимо, Jaccard similarity >= 0.9 → direct merge
    - Gemini 2.5 Flash только при расхождении (similarity < 0.9)
    - GpuFallbackService: один движок упал → single-source (confidence=0.5)
    - Очереди: ocr / ocr-paddle / ocr-surya / ocr-results
    - Полная документация: apps/photo-service/docs/architecture.md

otp-service (порт 3001)
    OTP доставка банковского уровня.
    POST /otp/send → rate-limit → generate → multi-channel failover → audit log

    Ключевые детали:
    - 4 уровня rate limiting через Redis (cooldown / per-phone-10m / per-phone-1h / per-ip)
    - Каналы: SMS → WhatsApp → Voice (приоритет по стране)
    - Провайдеры: Fast2SMS, MSG91, Twilio с dynamic scoring + circuit breaker
    - timingSafeEqual — защита от timing attack
    - DLR webhooks: Twilio (HMAC-SHA1) + MSG91
    - DLR timeout CRON: SENT → TIMEOUT через 10 сек
    - Полная документация: apps/otp-service/docs/architecture.md


5. Конфигурация и ENV

Каждый сервис валидирует ENV при старте через createValidator().
Общие переменные:

    NODE_ENV           development | production | test
    DATABASE_URL       PostgreSQL connection string (обязательно)
    REDIS_HOST         default: localhost
    REDIS_PORT         default: 6379

Сервис-специфичные переменные — в CLAUDE.md и docs/architecture.md каждого сервиса.

Важно: все @IsNumber() поля ДОЛЖНЫ иметь @Transform() — иначе ConfigService
вернёт class default вместо process.env значения при использовании Jest + moduleNameMapper.


6. База данных

Каждый сервис имеет независимую Prisma схему:

    apps/photo-service/prisma/schema.prisma
    - Photo, OcrResult, MergedOcrResult

    apps/otp-service/prisma/schema.prisma
    - OtpAuditLog, DlrCallback, ProviderHealth

    Prisma client генерируется в generated/prisma/ (не в node_modules/.prisma/)
    Prisma 7: datasource URL через prisma.config.ts + defineConfig


7. Тестирование

E2E тесты через Testcontainers — реальные PostgreSQL + Redis контейнеры:

    @testcontainers/postgresql — PostgreSQL 16 Alpine
    @testcontainers/redis      — Redis 7 Alpine

Паттерн:
    1. Поднять контейнеры (beforeAll, timeout 120s)
    2. Запустить prisma migrate deploy против тестовой БД
    3. Test.createTestingModule() с overrideProvider() для внешних зависимостей:
       - ChannelOrchestratorService → mock (otp-service)
       - REDIS_CLIENT → прямой ioredis клиент на testcontainer порт
       - GpuFallbackService → { onModuleInit: () => {} } (photo-service)
       - GeminiOcrService → { extractText: async () => '' } (photo-service)
    4. afterEach: очистка БД + redis.flushdb() + ocrQueue.drain()
    5. afterAll: app.close() → redis.quit() → containers.stop()

Команды:
    npm run test:e2e   # внутри папки сервиса


8. Структура сервиса (стандарт)

    src/
    ├── app.module.ts          — root module
    ├── main.ts                — bootstrap (ValidationPipe, GlobalExceptionFilter)
    ├── config/
    │   └── env.validation.ts  — ENV schema, extends BaseEnvironmentVariables
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── <domain>/
    │   ├── <domain>.module.ts
    │   ├── <domain>.controller.ts
    │   └── <domain>.service.ts
    ├── health/
    │   └── health.controller.ts — GET /health
    └── queue/ (если есть BullMQ)
        ├── <name>.processor.ts
        └── queue.module.ts

    prisma/
    └── schema.prisma

    generated/
    └── prisma/           — Prisma client (gitignored, генерируется при build)

    test/
    └── app.e2e-spec.ts


9. Docker и деплой

    Корневой docker-compose.yml — полный стек (NestJS + Postgres + Redis):
    - postgres:17-alpine
    - redis:7-alpine
    - photo-service и otp-service как контейнеры

    apps/photo-service/docker-compose.yml — только инфраструктура (Postgres + Redis):
    - GPU воркеры (PaddleOCR, Surya) запускаются нативно на Mac через start-dev.sh
    - В production — GPU воркеры в отдельных контейнерах (nvidia/cuda) на нодах с GPU

    Локальный запуск (Mac):
    - ./start-dev.sh — Docker (Postgres+Redis) + NestJS + Python GPU workers нативно через pyenv


10. Принципы разработки

- Каждый сервис полностью независим: свой package.json, своя схема, свой деплой
- Shared packages — только когда логика нужна 3+ сервисам
- Секреты — только через ENV, никогда в коде
- Dedup стратегии где применимо (SHA-256 для файлов, unique constraints для данных)
- Временные файлы удаляются после обработки
- Все внешние интеграции (AI, GPU, SMS) — за интерфейсами-адаптерами
- Race conditions — через DB unique constraints + catch P2002
- Retry: 3 попытки, exponential backoff (1s base) для всех BullMQ очередей
