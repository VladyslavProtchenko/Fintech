# План скиллов — спецификация каждого скилла

## Общая схема

```
create-client-platform (оркестратор)
  │
  ├─ 1. platform-research    → стратегия бренда
  ├─ 2. platform-design      → визуальная айдентика
  ├─ 3. platform-api         → NestJS бекенд
  ├─ 4. platform-web         → Next.js фронтенд
  └─ 5. platform-deploy      → Docker + деплой + ссылки

platform-test (отдельно, по запросу)
  → E2E тесты на задеплоенном сайте
```

---

## 1. platform-research

### Когда вызывается

Пользователь описывает бизнес-идею: название, сфера деятельности, концепция. Или оркестратор передаёт это описание.

### Что делает

**Шаг 1 — Разбор описания:**
- вытаскивает индустрию, целевую аудиторию, ключевые услуги
- определяет тон коммуникации (формальный, дружелюбный, технический)
- формулирует как платёжные функции вписываются в бизнес-контекст

**Шаг 2 — Исследование рынка:**
- ищет в интернете компании из этой индустрии
- изучает сайты конкурентов — дизайн, структура, цвета, контент
- отмечает паттерны и тренды в этой сфере
- собирает идеи для контента лендинга

**Шаг 3 — Проверка реестра:**
- читает `docs/client-registry.md`
- сканирует `platforms/` на существующие слаги
- определяет следующую свободную пару портов
- проверяет какие стили эндпоинтов, цвета, шрифты, лейауты уже заняты

**Шаг 4 — Формирование стратегии:**
- название бренда и слоган
- цветовой hue (30+ градусов от существующих)
- пара шрифтов (заголовок + текст)
- стиль лендинга (hero-centered, hero-split, hero-gradient, minimal)
- вариант лейаута дашборда (sidebar-left, sidebar-right, top-nav, minimal)
- терминология для действий (депозит, перевод, баланс, история — уникальные слова)
- стиль отображения транзакций (таблица, карточки, таймлайн)
- стиль эндпоинтов бекенда (пути, префиксы)
- формат ошибок бекенда (nested, flat, verbose, API-style)
- названия полей в DTO (amount vs sum vs value)
- название модуля бекенда (wallet, account, funds, balance)
- краткое описание контента для лендинга — о чём писать, какие секции

**Шаг 5 — Чтение секретов:**
- `PAYMENT_API_KEY` из `apps/payment-service/.env`
- формат `DATABASE_URL` из любой существующей платформы (например `platforms/apricot/api/.env`)

### Что на выходе

Документ-стратегия со всеми решениями. Этот документ — входные данные для всех следующих скиллов. Агент не останавливается и не ждёт подтверждения — сразу передаёт в `platform-design`.

### Какие файлы читает

- `docs/client-registry.md`
- `apps/payment-service/.env`
- любой `platforms/*/api/.env` (для формата DATABASE_URL)

### Какие файлы создаёт

Никаких. Стратегия остаётся в контексте разговора.

---

## 2. platform-design

### Когда вызывается

Сразу после `platform-research`. Получает стратегию из контекста.

### Что делает

**Шаг 1 — Концепция логотипа:**
- придумывает 3 варианта иконки, привязанных к названию/теме бренда
- выбирает самый сильный (узнаваемый на маленьких размерах, работает в одном цвете)

**Шаг 2 — Генерация SVG:**
- `logo.svg` — иконка + название рядом (viewBox 160×40)
- `favicon.svg` — только иконка (viewBox 32×32)
- один цвет, геометрия, без градиентов и теней
- иконка должна читаться на 16px

**Шаг 3 — Дизайн-токены:**
- основной цвет (primary) из выбранного hue
- палитра оттенков (50-950)
- шрифты — Google Fonts, заголовок + текст
- стиль компонентов — радиусы, тени, отступы

### Что на выходе

- готовые SVG файлы (пока в контексте, запишутся на диск в `platform-web`)
- дизайн-токены для Tailwind конфига
- решения по лейауту

### Какие файлы создаёт

Никаких. Всё остаётся в контексте до `platform-web`.

---

## 3. platform-api

### Когда вызывается

Сразу после `platform-design`. Получает стратегию и дизайн-решения из контекста.

### Что делает

Генерирует полный NestJS проект в `platforms/<slug>/api/`.

**Конфигурация проекта:**
- `package.json` — workspace зависимости на все shared-пакеты
- `tsconfig.json` — extends base, rootDir `./src`, incremental false, пути к shared-пакетам через `dist/index`
- `nest-cli.json` — tsc builder, deleteOutDir true
- `prisma/schema.prisma` — User модель с `paymentClientId?` и `walletId?`, output внутри `src/`
- `prisma.config.ts` — defineConfig с DATABASE_URL
- `.env` — реальные значения скопированные из payment-service и существующих платформ
- `.gitignore`

**Модули:**
- `src/config/env.validation.ts` — extends BaseEnvironmentVariables, createValidator
- `src/prisma/` — PrismaModule (global) + PrismaService через withPrismaAdapterPg
- `src/auth/` — AuthModule, AuthController, AuthService, DTOs. Регистрация создаёт только локального юзера. AuthModule импортирует JwtModule.registerAsync напрямую
- `src/<module>/` — PaymentService bridge (ensurePaymentClient, маппинг транзакций, баланс через getClient), контроллер, DTOs
- `src/user/` — поиск юзера по email
- `src/health/` — локальный HealthModule с TerminusModule, SELECT 1 проверка
- `src/common/filters/` — GlobalExceptionFilter с уникальным форматом ошибок

**Точка входа:**
- `src/app.module.ts` — все модули + createAuthModule() + ConfigModule
- `src/main.ts` — ValidationPipe, CORS, GlobalExceptionFilter, Swagger (путь `'docs'`)

**Docker:**
- `Dockerfile` — multi-stage (builder + production), corepack enable, копирование packages

### Правила которые нельзя нарушать

- payment-sdk для всех платёжных операций
- Prisma 7 — нет `url` в datasource, output внутри `src/`, import из `generated/prisma/client`
- PrismaService — через mixin withPrismaAdapterPg, никогда вручную Pool
- shared-auth — createAuthModule, JwtAuthGuard, CurrentUser, hashPassword/comparePassword. Не дублировать локально
- AuthModule — JwtModule.registerAsync напрямую (createAuthModule @Global не пробрасывает JwtService)
- HealthModule — локальный с TerminusModule (createHealthModule возвращает DynamicModule, нельзя extends)
- shared-config — BaseEnvironmentVariables + createValidator
- tsconfig — rootDir `./src`, incremental false, все @fintech/* пути → `../../../packages/<pkg>/dist/index`
- nest-cli.json — tsc (не SWC), deleteOutDir true
- Регистрация — только локальный User, без вызова payment-service
- Ленивое подключение — ensurePaymentClient при первом обращении к кошельку
- ensurePaymentClient — проверять что walletId не null после создания
- GlobalExceptionFilter — ловить HttpException + PaymentServiceError + unknown
- PaymentServiceError → 422 для insufficient funds, 502 для остального
- Swagger путь — `'docs'` (Caddy стрипает `/api/`)
- GET /health — публичный, без авторизации
- Валидация env при старте — приложение падает на отсутствующих переменных
- Строгий TypeScript — нет `any`, нет `as` без причины

### Какие файлы читает

- `packages/payment-sdk/src/` — типы SDK, понять что оборачивает bridge
- `packages/shared-auth/src/` — экспорты (createAuthModule, JwtAuthGuard, CurrentUser)
- `packages/shared-prisma/src/` — withPrismaAdapterPg
- `packages/shared-config/src/` — BaseEnvironmentVariables, createValidator
- `platforms/apricot/api/src/` — референсная реализация
- стратегию из контекста (стиль эндпоинтов, формат ошибок, названия полей)

### Какие файлы создаёт

Все файлы в `platforms/<slug>/api/` — полный NestJS проект готовый к компиляции.

---

## 4. platform-web

### Когда вызывается

Сразу после `platform-api`. Получает стратегию, дизайн и сгенерированный API из контекста.

### Что делает перед генерацией (ВАЖНО)

**Читает сгенерированный API чтобы не было рассинхрона:**
- контроллеры — реальные пути эндпоинтов (например `/api/v2/wallet/topup` или `/v1/wallet/deposit`)
- DTOs — реальные названия полей (amount, sum, value)
- формат ответов — структура JSON которую возвращает бекенд
- формат ошибок — чтобы фронтенд правильно парсил ошибки

Это гарантирует что фронтенд action URLs совпадают с бекенд роутами.

### Что генерирует

**Конфигурация:**
- `package.json` — next, react, react-dom (без TanStack Query, без Zustand)
- `tsconfig.json`
- `next.config.ts` — output standalone
- `postcss.config.mjs` — @tailwindcss/postcss
- `.env.local` — API_URL, NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL
- `.env.example`
- `.gitignore`
- `.dockerignore` — node_modules, .next, .env.local (ОБЯЗАТЕЛЬНО — без него Docker билд падает)

**Статика:**
- `public/logo.svg` — из platform-design
- `public/favicon.svg` — из platform-design

**Стили:**
- `src/app/globals.css` — Tailwind 4 с @theme блоком (цвета, шрифты из стратегии)

**API слой:**
- `src/lib/api.ts` — серверный fetch wrapper. Читает cookies(), добавляет Authorization. Поддерживает `query` параметр для GET запросов. ApiError в этом же файле (не отдельный errors.ts)

**Server Actions:**
- `src/actions/auth.ts` — login, register, logout
- `src/actions/payment.ts` — deposit (revalidatePath + redirect), wire (revalidatePath + return null)
- `src/actions/user.ts` — searchUser (через query параметр)

**Страницы:**
- `src/app/layout.tsx` — root layout, шрифты, metadata, favicon
- `src/app/page.tsx` — лендинг с уникальным контентом про бизнес (из исследования)
- `src/app/(auth)/login/page.tsx` + login-form компонент
- `src/app/(auth)/register/page.tsx` + register-form компонент
- `src/app/(dashboard)/layout.tsx` — auth guard + shell дашборда (лого в навигации)
- `src/app/(dashboard)/dashboard/page.tsx` — Server Component, баланс + последние транзакции
- `src/app/(dashboard)/deposit/page.tsx` + deposit form
- `src/app/(dashboard)/send/page.tsx` + send form (multi-step)
- `src/app/(dashboard)/history/page.tsx` — Server Component, пагинация через searchParams

**Компоненты:**
- `src/components/forms/` — формы для auth, deposit, send
- `src/components/ui/` — button, input, card, badge
- `src/components/layout/` — header, sidebar/nav, footer

**Docker:**
- `Dockerfile` — multi-stage, standalone output

### Правила которые нельзя нарушать

- Все API вызовы через Server Components или Server Actions — никогда client-side fetch
- lib/api.ts — server-only, cookies() из next/headers, query параметр для GET, ApiError в этом же файле
- Формы — useActionState (React 19)
- Deposit action — revalidatePath('/dashboard') + revalidatePath('/history') + redirect('/dashboard')
- Wire action — revalidatePath('/dashboard') + revalidatePath('/history') + return null
- Send-form — useEffect + hasSubmitted для определения успеха. Никогда не проверять sendError внутри action wrapper (stale closure)
- Server Components — graceful error handling. try/catch вокруг api() вызовов, показать пустое состояние при ошибке. redirect только на 401
- History — пагинация через URL searchParams, query параметр в api()
- Auth — httpOnly cookie, устанавливается в server action, читается в layout guard
- .dockerignore — ОБЯЗАТЕЛЕН
- Action URLs — ДОЛЖНЫ точно совпадать с роутами бекенда (проверяется чтением контроллеров)

### Какие файлы читает

- `platforms/<slug>/api/src/*/**.controller.ts` — пути эндпоинтов
- `platforms/<slug>/api/src/*/dto/*.ts` — названия полей
- `platforms/<slug>/api/src/common/filters/` — формат ошибок
- `platforms/apricot/web/src/` — референсная реализация
- стратегию и дизайн из контекста

### Какие файлы создаёт

Все файлы в `platforms/<slug>/web/` — полный Next.js проект.

---

## 5. platform-deploy

### Когда вызывается

Сразу после `platform-web`. API и Web уже сгенерированы.

### Что делает

**Шаг 1 — docker-compose:**
- создаёт `platforms/<slug>/docker-compose.yml`
- Caddy labels для автоматического домена `<slug>.localhost`
- API и Web сервисы
- networks: caddy (external) + internal

**Шаг 2 — Обновление инфраструктуры:**
- добавляет `CREATE DATABASE <slug>_db;` в `docker/postgres/init.sql`
- добавляет строку в `docs/client-registry.md`

**Шаг 3 — Компиляция:**
- `pnpm install`
- билд всех shared-пакетов
- `npx prisma generate` в директории API
- `npx tsc --noEmit` — проверка компиляции бекенда
- если ошибки — исправляет до деплоя

**Шаг 4 — Деплой:**
- вариант A: POST в platform-manager (`http://localhost:3020/platforms`)
- если висит больше 3 минут — вариант B: ручной `docker compose build && up -d`
- ждёт запуска контейнеров

**Шаг 5 — Проверка здоровья:**
- `curl http://<slug>.localhost/api/health` — ожидается 200
- `curl http://<slug>.localhost` — ожидается 200
- `curl http://<slug>.localhost/api/docs` — ожидается 200 (Swagger)

**Шаг 6 — Возврат результата:**
- Сайт: `http://<slug>.localhost`
- Swagger: `http://<slug>.localhost/api/docs`

### Правила

- Этот шаг ОБЯЗАТЕЛЕН — задача не завершена пока сайт не запущен
- Swagger путь в docker-compose: Caddy стрипает `/api/`, бекенд слушает на `/docs`
- DATABASE_URL в docker-compose: `postgresql://postgres:postgres@postgres:5432/<slug>_db`
- PAYMENT_API_URL в docker-compose: `http://payment-service:3004`
- Сеть caddy — external, контейнер postgres уже запущен в основном docker-compose

### Какие файлы читает

- `platforms/apricot/docker-compose.yml` — референс
- `docker/postgres/init.sql` — для добавления базы
- `docs/client-registry.md` — для добавления записи

### Какие файлы создаёт

- `platforms/<slug>/docker-compose.yml`
- обновляет `docker/postgres/init.sql`
- обновляет `docs/client-registry.md`

---

## 6. platform-test

### Когда вызывается

Отдельно, по запросу пользователя. Сайт уже задеплоен и работает.

### Что делает

**Тест 1 — Health:**
- GET `http://<slug>.localhost/api/health` → 200

**Тест 2 — Swagger:**
- GET `http://<slug>.localhost/api/docs` → 200

**Тест 3 — Регистрация:**
- POST регистрация тестового юзера (email: `test-<slug>@test.com`, password: `TestPass123!`)
- проверить что вернулся токен или успешный ответ
- сохранить токен для следующих тестов

**Тест 4 — Логин:**
- POST логин с теми же данными
- проверить что вернулся токен

**Тест 5 — Баланс (первый запрос):**
- GET баланс — должен вернуть 0 или создать кошелёк (lazy provisioning)
- проверить структуру ответа

**Тест 6 — Депозит:**
- POST депозит $500
- GET баланс — должен быть 500
- проверить что транзакция появилась в истории

**Тест 7 — Регистрация второго юзера:**
- POST регистрация `test2-<slug>@test.com`
- сохранить данные

**Тест 8 — Перевод:**
- от первого юзера: POST перевод $100 на test2
- GET баланс первого — должен быть 400
- GET баланс второго — должен быть 100
- проверить транзакции у обоих

**Тест 9 — Перевод самому себе:**
- POST перевод самому себе — должен вернуть ошибку

**Тест 10 — Недостаточно средств:**
- POST перевод $10000 — должен вернуть ошибку (422 или аналог)

**Тест 11 — Фронтенд:**
- GET главная страница → 200, проверить что есть название бренда в HTML
- GET /login → 200
- GET /register → 200
- GET /dashboard без авторизации → redirect на /login

### Формат результата

```
platform-test: <slug>
═══════════════════════
[OK]   Health endpoint
[OK]   Swagger docs
[OK]   Register user
[OK]   Login
[OK]   Balance (lazy provision)
[OK]   Deposit $500
[FAIL] Transfer $100 — expected 200, got 500
       Response: {"error": "..."}
[SKIP] Self-transfer (blocked by previous failure)
...
═══════════════════════
Result: 6/11 passed, 1 failed, 4 skipped
```

При падении теста — показать запрос, ответ, ожидание. Дальше пользователь решает чинить или нет.

### Какие файлы читает

- `docs/client-registry.md` — чтобы знать порты и стиль эндпоинтов платформы
- `platforms/<slug>/api/src/*/**.controller.ts` — чтобы знать точные пути для запросов
- `platforms/<slug>/api/src/*/dto/*.ts` — чтобы знать формат тела запросов

---

## 7. create-client-platform (оркестратор)

### Когда вызывается

Пользователь говорит "создай платформу", "сгенерируй клиента", "добавь новую платформу" и даёт описание бизнеса.

### Что делает

Запускает скиллы 1→2→3→4→5 последовательно, без пауз и подтверждений.

```
Вход: описание бизнеса от пользователя
  │
  ├─ platform-research  → стратегия (в контексте)
  ├─ platform-design    → SVG + токены (в контексте)
  ├─ platform-api       → файлы на диске
  ├─ platform-web       → файлы на диске
  └─ platform-deploy    → контейнеры запущены
  │
Выход: две ссылки (сайт + swagger)
```

### Правила оркестратора

- Не останавливаться между шагами
- Не спрашивать подтверждение
- Если на каком-то шаге ошибка — починить и продолжить
- Задача завершена ТОЛЬКО когда возвращены ссылки на работающий сайт
- platform-test НЕ входит в оркестратор — запускается отдельно

### Какие файлы сам не создаёт

Никаких. Всю работу делают вызываемые скиллы.
