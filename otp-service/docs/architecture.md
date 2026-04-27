
OTP Delivery Service — Banking-Grade Architecture

Multi-provider, multi-channel OTP delivery with dynamic routing, circuit breaker, and full audit trail.
NestJS + Redis (OTP storage + rate limiting + scoring) + PostgreSQL (audit log) + ioredis.
Индия — primary market. Глобальное расширение через plug-and-play адаптеры.


1. Приём запроса (NestJS)

- NestJS — независимый HTTP микросервис, POST /otp/send, POST /otp/verify
- ValidationPipe — whitelist + transform, запрещает лишние поля
- libphonenumber-js — парсинг телефона: E.164, определение страны, national number
- SHA-256 хеш телефона — используется как ключ в Redis, raw номер не хранится
- Маскировка — +919523924983 → +91****4983 (в логи и БД идёт только маска)
- IP-адрес — извлекается из request, передаётся в rate limiter


2. Rate Limiting (Redis, атомарный)

4 уровня защиты от абьюза, все через Redis:

    Cooldown — 30 сек между запросами на один номер
    - SET cooldown:{phoneHash} 1 EX 30
    - Ставится ДО отправки (защита от race condition)
    - Снимается если отправка провалилась

    Per-phone 10 мин — максимум 5 OTP за 10 минут
    - INCR rl:10m:{phoneHash}, TTL 600

    Per-phone 1 час — максимум 10 OTP в час
    - INCR rl:1h:{phoneHash}, TTL 3600

    Per-IP 10 мин — максимум 20 запросов с одного IP
    - INCR rl:ip:10m:{ip}, TTL 600

Счётчики инкрементируются через Redis pipeline (одна атомарная операция).


3. Генерация OTP

- randomInt(0, Math.pow(10, otpLength)) — криптографически безопасный генератор (named import из 'crypto')
- Длина настраиваемая (по умолчанию 6 цифр)
- padStart — гарантия нужной длины (000001 — валидный OTP)
- Хранение в Redis: otp:{phoneHash} → { code, requestId, attempts, createdAt }
- TTL 300 секунд (5 минут), настраиваемый


4. Multi-Channel Failover (ядро доставки)

Три канала доставки с приоритетом по стране:

    Индия:  SMS → WhatsApp → Voice
    Default: SMS → Voice

ChannelOrchestratorService перебирает каналы по порядку.
Если канал провалился — автоматический переход на следующий.
Результат — failoverChain: полная история попыток.

Для каждого канала работает ProviderRouterService:


5. Dynamic Provider Routing

Внутри каждого канала — несколько провайдеров, отсортированных по динамическому скору:

    Провайдеры SMS (Индия):
    - fast2sms — локальный, быстрый, дешёвый, DLT route
    - msg91 — надёжный, DLR поддержка
    - twilio — глобальный fallback

    Провайдеры WhatsApp (Индия):
    - msg91
    - twilio

    Провайдеры Voice (Индия):
    - msg91
    - twilio

    Глобальные (все страны):
    - twilio (SMS + WhatsApp + Voice)

Выбор провайдера:
1. Фильтрация — isConfigured() (есть API ключ?) + supportedCountries
2. Circuit Breaker — пропускаем провайдеров с открытым circuit
3. Dynamic Scoring — сортировка по score desc
4. Попытка отправки — первый в списке, при ошибке → следующий


6. Dynamic Scoring (Redis)

Формула: score = successRate × 0.8 + speedScore × 0.2

    successRate = successCount / (successCount + failureCount)
    speedScore  = max(0, 1 - avgLatencyMs / 15000)

- Новые провайдеры стартуют с score = 0.5
- Redis ключ: score:{provider}:{country}:{channel}
- TTL 1 час (sliding window) — старые данные автоматически обнуляются
- Система самообучается: быстрые и надёжные провайдеры поднимаются наверх


7. Circuit Breaker (Redis)

Три состояния:

    CLOSED (нормальная работа)
    → 5 последовательных ошибок → OPEN

    OPEN (провайдер заблокирован)
    → через 60 секунд → HALF_OPEN

    HALF_OPEN (тестовый запрос)
    → успех → CLOSED
    → ошибка → обратно в OPEN

- Redis ключ: circuit:{provider}:{country}
- TTL 1 час
- Shared state — все инстансы видят одинаковое состояние


8. Верификация OTP

- Получаем payload из Redis по otp:{phoneHash}
- timingSafeEqual — защита от timing attack
- Буферы выравниваются через padEnd(8, '\0') + финальная строковая проверка
- Максимум 3 попытки, после чего OTP удаляется
- При успехе — удаление из Redis, обновление аудит лога (VERIFIED)
- При исчерпании попыток — удаление + статус FAILED


9. DLR Webhooks (Delivery Reports)

Провайдеры присылают статус доставки на вебхуки:

    POST /webhooks/dlr/twilio
    - HMAC-SHA1 подпись валидируется (authToken + webhookUrl)
    - MessageSid/SmsSid → providerRef
    - MessageStatus: delivered / failed / undelivered

    POST /webhooks/dlr/msg91
    - requestId → providerRef
    - Числовые статус-коды → delivered / failed

Обработка:
1. Сохраняем raw payload в DlrCallback (никогда не теряем данные)
2. Нормализуем статус → delivered | failed | undelivered | unknown
3. Обновляем OtpAuditLog: SENT → DELIVERED или SENT → FAILED


10. DLR Timeout Monitor (CRON)

- @Cron(EVERY_MINUTE) — каждую минуту
- Ищет OtpAuditLog со статусом SENT старше DLR_TIMEOUT_MS (10 сек по умолчанию)
- Помечает как TIMEOUT — DLR не пришёл, доставка не подтверждена
- Логирует количество таймаутов


11. Provider Health Dashboard

    GET /admin/providers — real-time статус всех провайдеров:

    {
      "providers": [
        {
          "provider": "fast2sms",
          "country": "IN",
          "channel": "SMS",
          "circuit": "closed",
          "score": 0.87,
          "successRate": 0.94,
          "avgLatencyMs": 342
        }
      ]
    }

Данные собираются из Redis (circuit breaker + scorer) для каждой пары из PROVIDER_REGISTRY.


12. Audit Trail (PostgreSQL)

Каждая отправка OTP записывается в OtpAuditLog:

    phone         — маскированный (+91****4983)
    phoneHash     — SHA-256 для поиска
    country       — ISO 3166-1 (IN, US, ...)
    channel       — SMS | WHATSAPP | VOICE
    provider      — fast2sms | msg91 | twilio
    providerRef   — ID от провайдера для DLR трекинга
    status        — SENT → DELIVERED / FAILED / TIMEOUT / VERIFIED / EXPIRED
                   (PENDING зарезервирован в схеме, в текущем коде не используется)
    failoverChain — JSON массив всех попыток [{provider, channel, success, latencyMs, error}]
    attempts      — количество попыток верификации
    duration      — время от запроса до финального статуса (ms)
    ipAddress     — IP отправителя
    userAgent     — User-Agent

Индексы: phoneHash+createdAt, provider+status+createdAt, channel+status+createdAt, ipAddress+createdAt.


13. Plug-and-Play провайдеры

Добавить нового провайдера = 3 шага:

    1. Создать адаптер в src/providers/adapters/
       - Реализовать SmsProviderAdapter интерфейс
       - isConfigured() проверяет ENV ключ
       - send() отправляет сообщение

    2. Зарегистрировать в src/providers/providers.module.ts
       - Добавить в массив providers и exports

    3. Добавить в src/config/routing.config.ts
       - Одна строка: { name: 'newprovider', channel: Channel.SMS, countries: ['US'] }

Провайдер активируется ТОЛЬКО если ENV ключ задан. Нет ключа = адаптер пропускается.


14. База данных (PostgreSQL + Prisma)

    OtpAuditLog     — полная история всех OTP операций
    ProviderHealth   — агрегированная статистика провайдера (unique: provider+country+channel)
    DlrCallback      — сырые DLR данные от провайдеров (index: providerRef)

    Prisma 7 — datasource URL через prisma.config.ts + defineConfig (не в schema)
    Generated client → generated/prisma/


15. Хранение данных

    Redis (быстрые операции, TTL)
    - otp:{phoneHash}           — OTP код + метаданные (TTL 5 мин)
    - cooldown:{phoneHash}      — блокировка повторной отправки (TTL 30 сек)
    - rl:10m:{phoneHash}        — счётчик за 10 минут (TTL 600 сек)
    - rl:1h:{phoneHash}         — счётчик за час (TTL 3600 сек)
    - rl:ip:10m:{ip}            — счётчик по IP (TTL 600 сек)
    - circuit:{provider}:{country}      — circuit breaker state (TTL 1 час)
    - score:{provider}:{country}:{channel} — dynamic score data (TTL 1 час)

    PostgreSQL (долгосрочное хранение)
    - OtpAuditLog — аудит каждой операции
    - DlrCallback — сырые данные от провайдеров
    - ProviderHealth — агрегированная статистика


16. API эндпоинты

- POST /otp/send           — отправка OTP, возвращает { requestId, maskedPhone, channel, provider, expiresIn }
- POST /otp/verify         — верификация OTP, возвращает { success, attemptsLeft }
- POST /webhooks/dlr/twilio — DLR callback от Twilio (204 No Content)
- POST /webhooks/dlr/msg91  — DLR callback от MSG91 (204 No Content)
- GET  /admin/providers     — health dashboard всех провайдеров
- GET  /health              — health check (PostgreSQL + Redis)


17. ENV переменные

    Обязательные:
    DATABASE_URL                — PostgreSQL connection string
    REDIS_HOST                  — Redis host (default: localhost)
    REDIS_PORT                  — Redis port (default: 6379)

    Провайдеры (опциональные — ставишь ключ = провайдер активен):
    FAST2SMS_API_KEY            — Fast2SMS (Индия SMS)
    FAST2SMS_ROUTE              — q (quick) или dlt (default: q)
    FAST2SMS_SENDER_ID          — sender ID (default: FSTSMS)
    FAST2SMS_DLT_TEMPLATE_ID   — DLT template ID
    MSG91_AUTH_KEY              — MSG91 (SMS + WhatsApp + Voice)
    MSG91_SMS_TEMPLATE_ID       — SMS template
    MSG91_WHATSAPP_TEMPLATE_ID  — WhatsApp template
    TWILIO_ACCOUNT_SID          — Twilio (глобальный fallback)
    TWILIO_AUTH_TOKEN           — Twilio auth
    TWILIO_FROM_NUMBER          — SMS отправитель
    TWILIO_WHATSAPP_FROM        — WhatsApp отправитель
    TWILIO_VOICE_FROM           — Voice отправитель

    OTP настройки:
    OTP_LENGTH                  — длина кода (default: 6)
    OTP_TTL_SECONDS             — время жизни (default: 300)
    OTP_MAX_ATTEMPTS            — попытки верификации (default: 3)
    OTP_COOLDOWN_SECONDS        — cooldown между отправками (default: 30)
    OTP_RATE_LIMIT_PER_10MIN    — лимит на телефон / 10 мин (default: 5)
    OTP_RATE_LIMIT_PER_HOUR     — лимит на телефон / час (default: 10)
    OTP_IP_RATE_LIMIT_PER_10MIN — лимит на IP / 10 мин (default: 20)

    DLR:
    DLR_TIMEOUT_MS              — таймаут DLR (default: 10000)
    DLR_WEBHOOK_BASE_URL        — базовый URL для Twilio signature validation


18. Структура проекта

    src/
    ├── config/
    │   ├── env.validation.ts        — валидация ENV (class-validator)
    │   └── routing.config.ts        — каналы, провайдеры, приоритеты
    ├── redis/
    │   ├── redis.module.ts          — глобальный Redis модуль
    │   └── redis.constants.ts       — REDIS_CLIENT Symbol token
    ├── prisma/
    │   ├── prisma.service.ts        — PrismaClient + PrismaPg adapter
    │   └── prisma.module.ts         — Prisma модуль
    ├── phone/
    │   ├── phone.service.ts         — parse, mask, hash
    │   └── phone.module.ts          — глобальный PhoneModule
    ├── providers/
    │   ├── adapters/
    │   │   ├── provider.interface.ts — SmsProviderAdapter interface
    │   │   ├── fast2sms.adapter.ts  — Fast2SMS (Индия, SMS)
    │   │   ├── msg91-sms.adapter.ts — MSG91 SMS
    │   │   ├── msg91-whatsapp.adapter.ts
    │   │   ├── msg91-voice.adapter.ts
    │   │   ├── twilio-sms.adapter.ts — Twilio SMS (глобальный)
    │   │   ├── twilio-whatsapp.adapter.ts
    │   │   └── twilio-voice.adapter.ts
    │   ├── providers.module.ts      — PROVIDER_ADAPTERS token, DI
    │   ├── provider-router.service.ts — выбор + failover внутри канала
    │   ├── provider-scorer.service.ts — dynamic scoring (Redis)
    │   └── circuit-breaker.service.ts — circuit breaker (Redis)
    ├── channels/
    │   ├── channel-orchestrator.service.ts — SMS→WhatsApp→Voice failover
    │   └── channels.module.ts
    ├── otp/
    │   ├── dto/
    │   │   ├── send-otp.dto.ts      — входные данные для отправки
    │   │   └── verify-otp.dto.ts    — входные данные для верификации
    │   ├── otp.service.ts           — generate, store, rate-limit, verify
    │   ├── otp.controller.ts        — POST /otp/send, POST /otp/verify
    │   └── otp.module.ts
    ├── webhooks/
    │   ├── dlr.service.ts           — нормализация DLR (Twilio, MSG91)
    │   ├── dlr.controller.ts        — POST /webhooks/dlr/{provider}
    │   └── webhooks.module.ts
    ├── monitoring/
    │   ├── monitoring.service.ts    — агрегация health данных
    │   ├── monitoring.controller.ts — GET /admin/providers
    │   ├── dlr-timeout.service.ts   — CRON: SENT → TIMEOUT
    │   └── monitoring.module.ts
    ├── health/
    │   ├── health.controller.ts     — GET /health (Terminus)
    │   └── health.module.ts
    ├── app.module.ts
    └── main.ts
