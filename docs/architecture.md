
Fintech Platform — Monorepo Architecture
=========================================

Self-hosted финтех платформа: микросервисы + белорычажные платёжные клиенты.
Monorepo на pnpm workspaces + Turborepo. TypeScript strict, NestJS, PostgreSQL + Prisma 7.


1. Структура репозитория
------------------------

    apps/
    ├── photo-service/          — OCR распознавание чеков (NestJS + BullMQ + Gemini)
    ├── otp-service/            — OTP через SMS/WhatsApp/Voice, multi-provider failover
    ├── payment-service/        — USD платёжное ядро (кошельки, транзакции, клиенты)
    ├── platform-manager/       — деплой-оркестратор для белорычажных платформ (NestJS)
    └── platform-manager-web/   — веб-интерфейс platform-manager (Next.js)

    packages/
    ├── payment-sdk/            — SDK для платёжных клиентов (HTTP-обёртка над payment-service)
    ├── shared-auth/            — JWT: createAuthModule(), JwtAuthGuard, @CurrentUser(), hashPassword/comparePassword
    ├── shared-config/          — BaseEnvironmentVariables, createValidator()
    ├── shared-errors/          — GlobalExceptionFilter + AppErrors factory
    ├── shared-health/          — createHealthModule() (Terminus)
    ├── shared-logger/          — AppLogger (NestJS LoggerService wrapper)
    ├── shared-prisma/          — withPrismaAdapterPg() mixin
    ├── shared-queue/           — BullMQ утилиты (общие настройки очередей)
    └── shared-redis/           — createRedisModule(), REDIS_CLIENT Symbol token

    platforms/
    ├── greenapple/             — White-label платёжный клиент (яблочный бизнес, Япония)
    ├── orange/                 — White-label платёжный клиент (испанские апельсины)
    ├── cactus/                 — White-label платёжный клиент (корпоративный)
    ├── apricot/                — White-label платёжный клиент (Абрикос UA, украинский)
    └── cherry/                 — White-label платёжный клиент (チェリー, японская газировка)

    .claude/skills/             — Claude Code skills для генерации платформ (7 скиллов)

    docs/
    ├── architecture.md         — этот файл
    ├── client-platform-spec.md — технический референс для white-label платформ
    ├── client-registry.md      — реестр всех платформ (порты, цвета, стили)
    └── site-generator-vision.md — бизнес-логика генератора платформ


2. Общий стек
-------------

    Язык:       TypeScript strict (no any, no as без причины)
    Runtime:    Node.js 22
    Framework:  NestJS 11
    DB:         PostgreSQL via Prisma 7 (adapter-pg, generated client → src/generated/prisma/)
    Queue:      BullMQ + Redis (только photo-service, otp-service)
    Config:     @nestjs/config + class-validator, env валидация при старте
    Build:      tsc (NestJS tsc builder, не SWC — стабильнее для monorepo paths)
    Monorepo:   pnpm workspaces + Turborepo


3. Shared Packages
------------------

payment-sdk
- PaymentClient — HTTP-клиент к payment-service
- Методы: createClient, getClient, topup, transfer, listTransactions
- PaymentServiceError — типизированная ошибка с флагом isInsufficientFunds
- Используется всеми white-label платформами через workspace:*

shared-auth
- createAuthModule() — @Global DynamicModule: JwtStrategy + JwtAuthGuard
- JwtAuthGuard, @CurrentUser() декоратор — используются в контроллерах
- hashPassword() / comparePassword() — bcrypt обёртки
- Важно: AuthModule каждой платформы ДОЛЖЕН импортировать JwtModule.registerAsync()
  напрямую (createAuthModule @Global не пробрасывает JwtService в дочерние модули)

shared-config
- BaseEnvironmentVariables: NODE_ENV, PORT, DATABASE_URL
- createValidator<T>() — обёртка для ConfigModule.forRoot({ validate })
- Каждая платформа расширяет BaseEnvironmentVariables своими полями

shared-errors
- GlobalExceptionFilter — перехватывает все исключения
- AppErrors — фабрика типизированных ошибок (используется в otp-service)

shared-health
- createHealthModule(Controller, { imports }) — DynamicModule
- Важно: возвращает DynamicModule, нельзя extend. Используй local HealthModule с TerminusModule

shared-logger
- AppLogger — NestJS LoggerService с structured JSON логами
- Используется через app.useLogger(app.get(AppLogger))

shared-prisma
- withPrismaAdapterPg(PrismaClient) — mixin, подключает PrismaPg адаптер через Pool
- Использование: class PrismaService extends withPrismaAdapterPg(PrismaClient) {}

shared-redis
- createRedisModule() — DynamicModule с global: true
- REDIS_CLIENT = Symbol('REDIS_CLIENT') — инжектируется через @Inject(REDIS_CLIENT)

shared-queue
- BullMQ утилиты (общие настройки очередей, retry политика)


4. Сервисы
----------

photo-service (порт 3000)
    OCR распознавание Receipt-чеков.
    POST /upload → BullMQ → PaddleOCR + SuryaOCR (параллельно) → Gemini merge → COMPLETED

    - SHA-256 dedup до обработки
    - Dual-Check: два движка независимо, Jaccard similarity >= 0.9 → direct merge
    - Gemini 2.5 Flash только при расхождении (similarity < 0.9)
    - GpuFallbackService: один движок упал → single-source
    - Очереди: ocr / ocr-paddle / ocr-surya / ocr-results

otp-service (порт 3001)
    OTP доставка банковского уровня.
    POST /otp/send → rate-limit → generate → multi-channel failover → audit log

    - 4 уровня rate limiting через Redis
    - Каналы: SMS → WhatsApp → Voice
    - Провайдеры: Fast2SMS, MSG91, Twilio с dynamic scoring + circuit breaker
    - timingSafeEqual — защита от timing attack
    - DLR webhooks: Twilio (HMAC-SHA1) + MSG91

payment-service (порт 3004)
    USD платёжное ядро — единственный сервис, который касается денег.
    Все white-label платформы работают через payment-sdk, который проксирует запросы сюда.

    Модели: Client, Wallet (balance DECIMAL 19,4), Transaction
    TxType: TOPUP | TRANSFER | WITHDRAWAL
    TxStatus: PENDING | COMPLETED | FAILED

    Ключевые детали:
    - Atomicity: все мутации баланса через Prisma $transaction
    - Idempotency: unique idempotencyKey на Transaction, catch P2002 → возвращает существующий
    - Insufficient funds → 422 UnprocessableEntityException
    - Межсервисная авторизация: x-api-key заголовок (API_KEY)
    - Каждая платформа создаёт своих Client через POST /clients

platform-manager (порт 3020)
    Деплой-оркестратор для генерации новых white-label платформ.
    Claude Code генерирует файлы, platform-manager собирает Docker образы и поднимает контейнеры.

    Pipeline: validateFiles → pnpmInstall → createDB → docker build → ensureNetwork → docker up → RUNNING
    API: POST /platforms, GET /platforms/:slug/status

platform-manager-web (порт 3021)
    Next.js интерфейс для platform-manager.
    UI для мониторинга статуса платформ и запуска деплоев.


5. White-Label Платформы
------------------------

Каждая платформа — пара NestJS API + Next.js Web, подключённая к payment-service через payment-sdk.
Все платформы доступны через Caddy Docker Proxy по домену <slug>.localhost.

    Slug      | API   | Web   | Theme               | Market
    ----------|-------|-------|---------------------|--------
    greenapple| 3010  | 3011  | green, Nunito+Inter  | Japan, apple business
    orange    | 3012  | 3013  | orange, Poppins+DM   | Spain, oranges
    cactus    | 3014  | 3015  | teal, Outfit+Inter   | Corporate
    apricot   | 3016  | 3017  | blue, Montserrat+NS  | Ukraine, Абрикос UA
    cherry    | 3018  | 3019  | red, MPLUS+Inter     | Japan/Korea, cherry soda

Архитектура платформы:

    platforms/<slug>/
    ├── api/                    — NestJS backend
    │   ├── src/
    │   │   ├── auth/           — JWT auth (register, login)
    │   │   ├── <wallet-module>/— bridge к payment-sdk (balance, topup, transfer, history)
    │   │   ├── <search>/       — поиск пользователя по email
    │   │   ├── health/         — GET /health
    │   │   └── common/filters/ — GlobalExceptionFilter (уникальный формат ошибок)
    │   └── prisma/schema.prisma— User модель (id, email, passwordHash, paymentClientId?, walletId?)
    └── web/                    — Next.js frontend
        └── src/
            ├── app/            — App Router (landing, auth, dashboard, deposit, send, history)
            ├── actions/        — Server Actions (auth, payment, user)
            ├── lib/api.ts      — server-only fetch wrapper с cookies() и ApiError
            └── components/     — forms, ui, layout

Ключевые паттерны платформ:
- Lazy provisioning: регистрация создаёт локального User. PaymentClient создаётся при первом
  обращении к кошельку (ensurePaymentClient)
- walletId не может быть null при операциях — бросает BadRequestException
- GlobalExceptionFilter обрабатывает HttpException + PaymentServiceError + unknown
- Frontend: только Server Components + Server Actions, никаких client-side fetch
- Send-форма: useEffect + hasSubmitted для детектирования успеха (избегает stale closure)
- Deposit action: revalidatePath + redirect('/dashboard')


6. Сетевая топология
---------------------

Все сервисы в Docker на одной сети caddy (external) + своей internal сети.
Caddy Docker Proxy автоматически читает labels контейнеров и настраивает маршрутизацию.

    Снаружи (браузер):
    http://<slug>.localhost/api/* → <slug>-api контейнер (Caddy strips /api/)
    http://<slug>.localhost/*    → <slug>-web контейнер

    Внутри Docker:
    <slug>-web → http://<slug>-api:<apiPort>  (прямой вызов, без Caddy)
    <slug>-api → http://payment-service:3004   (внутренняя сеть)
    platform-manager → docker socket           (для build/up команд)

Важно: Swagger path в NestJS = 'docs' (не 'api/docs').
После стриппинга /api/ Caddy публичный URL = http://<slug>.localhost/api/docs.


7. Prisma 7 — Паттерны
-----------------------

- datasource НЕ содержит url — это удалено в Prisma 7
- prisma.config.ts в корне сервиса: defineConfig({ datasource: { url: process.env.DATABASE_URL } })
- Generated client output ДОЛЖЕН быть внутри src/ (e.g. ../src/generated/prisma) — иначе tsc rootDir ломается
- Импорт: from 'generated/prisma/client' (не from 'generated/prisma')
- PrismaService: class PrismaService extends withPrismaAdapterPg(PrismaClient) {}
- Миграции: npx prisma migrate deploy в Docker CMD перед стартом


8. TypeScript Build — Важные детали
-------------------------------------

- tsconfig платформ: extends ../../../tsconfig.base.json
- rootDir: ./src, incremental: false (tsbuildinfo кэш ломает deleteOutDir)
- Все @fintech/* пути → ../../../packages/<pkg>/dist/index (3 уровня вверх от platforms/<slug>/api/)
  НЕ src/index.ts — иначе rootDir расширяется и tsc падает
- nest-cli.json: tsc builder (НЕ SWC), deleteOutDir: true


9. Генератор платформ (Claude Code Skills)
------------------------------------------

7 скиллов для автоматической генерации новой white-label платформы:

    .claude/skills/
    ├── create-client-platform/ — оркестратор (запускает шаги 1-5 без пауз)
    ├── platform-research/      — шаг 1: анализ бизнеса, ресёрч конкурентов, стратегия
    ├── platform-design/        — шаг 2: SVG логотип, favicon, токены дизайна
    ├── platform-api/           — шаг 3: генерация NestJS backend
    ├── platform-web/           — шаг 4: генерация Next.js frontend
    ├── platform-deploy/        — шаг 5: docker-compose, деплой, health check
    └── platform-test/          — E2E тесты (запускается отдельно после деплоя)

Pipeline: описание бизнеса → стратегия → дизайн → API → Web → деплой → live URLs
Время: ~10-15 минут от описания до работающего сайта.
Результат: http://<slug>.localhost + http://<slug>.localhost/api/docs


10. База данных
---------------

Каждый сервис/платформа имеет свою независимую БД в одном PostgreSQL инстансе.

    photo_service, otp_service      — legacy сервисы
    payment_service                 — платёжное ядро
    platform_manager                — деплой-менеджер
    greenapple_db, orange_db,       — white-label платформы
    cactus_db, apricot_db, cherry_db

Инициализация: docker/postgres/init.sql — CREATE DATABASE для каждой БД.


11. Docker и деплой
--------------------

Корневой docker-compose.yml запускает:
- postgres:17-alpine           — единый PostgreSQL для всех сервисов
- redis:7-alpine               — Redis для очередей
- payment-service              — платёжное ядро (всегда должно быть запущено)
- platform-manager             — деплой-оркестратор
- platform-manager-web         — UI
- caddy + docker-proxy         — reverse proxy с автодискавери

Каждая white-label платформа деплоится через platform-manager:
    POST http://localhost:3020/platforms { slug, displayName }
    → docker build → docker up
    → http://<slug>.localhost (live)

Локальный запуск photo-service (GPU workers):
    ./start-dev.sh — Docker (Postgres+Redis) + NestJS + Python GPU workers нативно


12. Принципы разработки
------------------------

- Каждый сервис/платформа полностью независим: свой package.json, схема, деплой
- Shared packages — только для логики нужной 3+ сервисам
- payment-sdk — единственная точка входа к payment-service из платформ
- Секреты — только через ENV, никогда в коде, .env в .gitignore
- Lazy provisioning в платформах — не создаём payment client до первого использования
- GlobalExceptionFilter обязателен — все неожиданные ошибки должны логироваться
- Server Components + Server Actions в Next.js — никакого client-side fetch к API
- Строгий TypeScript — no any, no as без причины
- Race conditions — через DB unique constraints + catch P2002
- Idempotency keys — crypto.randomUUID() для всех платёжных операций
