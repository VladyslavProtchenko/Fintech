
Self-Hosted OCR Receipt Recognition Service

PaddleOCR + Surya OCR (self-hosted) + Gemini 2.5 Flash (merge арбитраж).
Результат — чистый raw text чека. Без JSON-структурирования.
Основная логика на TypeScript (NestJS), Python только как обёртки GPU-моделей.


1. Приём изображений (NestJS)

- NestJS — API Gateway, принимает POST /upload, возвращает job_id
- Multer — загрузка файлов PNG / JPG / WEBP / HEIC / HEIF / DNG / TIFF
- file-type — детекция формата по magic bytes, не доверяем расширению
- SHA-256 — exact dedup до обработки (100% точность, без ложных срабатываний)
- BullMQ + Redis — очередь задач с приоритизацией и retry (3 попытки, exponential backoff)
- Лимит — 10 MB на файл


2. Подготовка изображения (NestJS, sharp + heic-convert)

- heic-convert — HEIC/HEIF → JPEG (единственный формат который GPU модели не читают)
- sharp .autoOrient() — правильная ориентация по EXIF (без этого фото может быть перевёрнутым)


3. Dual-Check OCR (ядро системы)

Два self-hosted движка читают изображение независимо, параллельно:

    Движок 1: PaddleOCR-VL (GPU сервер 1)
    - FastAPI обёртка
    - L4 GPU 24GB
    - 109 языков
    - Отдаёт: raw text + HTML tables
    - Латентность: ~1-2 сек/фото

    Движок 2: Surya OCR 0.17.1 (GPU сервер 2)
    - FastAPI обёртка
    - highres_images + sort_lines для максимального качества
    - L4 GPU 24GB
    - 90+ языков
    - Отдаёт: raw text
    - Латентность: ~1-3 сек/фото

Оба запроса отправляются ПАРАЛЛЕЛЬНО через BullMQ очереди.


4. Cross-validation & Merge

После получения обоих результатов:

    Шаг 1: Jaccard similarity (по словам, O(n))
    - Токенизация: strip HTML-тегов, нормализация пробелов, lowercase
    - Сравнение множеств слов: |A ∩ B| / |A ∪ B|
    - Работает на любой длине текста без truncate
    - Нечувствителен к HTML-мусору от Paddle и разному форматированию

    Шаг 2: Решение
    - similarity >= 0.9 → стратегия "direct"
        - Берём более длинный текст (больше данных извлечено)
        - confidence = similarity score
        - Gemini НЕ вызывается — $0
    - similarity < 0.9 → стратегия "gemini-arbitrated"
        - Отправляем оба текста в Gemini 2.5 Flash
        - Промпт: "Merge two OCR results into one accurate text"
        - Gemini выбирает лучшие фрагменты из каждого движка
        - confidence = similarity score

    Шаг 3: Сохранение
    - MergedOcrResult: mergedText, confidenceScore, mergeStrategy, selectedSource
    - Photo.status → COMPLETED

Race condition защита:
- MergedOcrResult.photoId @unique
- Если оба результата пришли одновременно и оба триггерят merge,
  второй insert падает с P2002 — игнорируем


5. BullMQ очереди

    ocr          — препроцессинг изображения, dispatch в paddle + surya
    ocr-paddle   — отправка в PaddleOCR GPU сервис (timeout: 2 мин)
    ocr-surya    — отправка в Surya GPU сервис (timeout: 2 мин)
    ocr-results  — получение результата, merge, сохранение

Все очереди: 3 attempts, exponential backoff (1s), removeOnComplete: 100, removeOnFail: 500


6. Таймаут и fallback при падении GPU

GPU очереди имеют timeout 2 минуты. После 3 неудачных попыток:

    Paddle упал, Surya дал результат
        → используем только Surya (confidence=0.50, strategy=single-source)
        → статус COMPLETED

    Surya упал, Paddle дал результат
        → используем только Paddle (confidence=0.50, strategy=single-source)
        → статус COMPLETED

    Оба упали
        → статус FAILED

GpuFallbackService слушает события failed на GPU очередях через QueueEvents.
Не конкурирует с Python-воркерами — только реагирует на финальные ошибки.


7. База данных (PostgreSQL + Prisma) и хранение файлов

    Photo — originalName, mimeType, size, sha256, originalPath, status, jobId
    OcrResult — photoId, source (paddle|surya), rawText, data (JSON)
    MergedOcrResult — photoId (unique), mergedText, confidenceScore, mergeStrategy, selectedSource 
        mergeStrategy: 'direct' | 'gemini-arbitrated' | 'single-source'

    Хранение файлов
        uploads/originals/ — загруженные файлы (удаляются после завершения OCR)


8. Запуск и Docker

    Production (Kubernetes / Docker):
    - postgres:17-alpine — база данных
    - redis:7-alpine — очередь BullMQ
    - photo-service — основной NestJS сервис (Dockerfile)
    - gpu-service-1 — PaddleOCR (nvidia/cuda контейнер, нода с GPU)
    - gpu-service-2 — Surya OCR (nvidia/cuda контейнер, нода с GPU)

    Локальная разработка (Mac):
    - docker compose up -d — только Postgres + Redis
    - NestJS — npm run start:dev
    - PaddleOCR + Surya — нативно через pyenv + .venv (GPU недоступен в Docker на Apple Silicon)
    - Всё одной командой: ./start-dev.sh


9. Время обработки

- Подготовка изображения (sharp) — 50-100ms
- PaddleOCR — 1-2 сек (параллельно)
- Surya OCR — 1-3 сек (параллельно)
- Merge (Jaccard + возможно Gemini) — 50ms-2 сек
- Итого 1 фото — p50 ~3 сек / p95 ~6 сек

Партии:
- 100 фото — ~5 мин
- 1 000 фото — ~40 мин
- 10 000 фото — ~6 часов


10. Качество (протестировано)

Тестовые чеки:
- Украинский фискальный чек — ~95% (все данные на месте, мелкие проблемы форматирования)
- Английский простой чек — 100%
- Английский ресторанный чек — 100%


11. API эндпоинты

- POST /upload — загрузка фото, возвращает { id, jobId, status }
- GET /results — список всех результатов (текст, confidence, стратегия)
- GET /results/:id — конкретный результат по ID
- GET /results/status/:photoId — статус обработки (PENDING/PROCESSING/COMPLETED/FAILED)


12. Стоимость (10 000 фото/день)
    Gemini 2.5 Flash  ~$79/мес
    При необходимости полного self-hosted решения — Gemini заменяется локальной LLM (Llama, Mistral), стоимость = $0.

итого: 5 дней и $80/мес