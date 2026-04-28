import { mkdirSync, rmSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { AppModule } from '../src/app.module';
import { AppLogger } from '@fintech/shared-logger';
import { GlobalExceptionFilter } from '@fintech/shared-errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { GpuFallbackService } from '../src/queue/gpu-fallback.service';
import { GeminiOcrService } from '../src/queue/services/gemini-ocr.service';

// Real JPEG for upload tests — processed successfully by sharp
const JPEG_FILE = readFileSync(join(__dirname, 'fixtures', 'test-image.jpeg'));

describe('photo-service (e2e)', () => {
  let app: INestApplication;
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let uploadDir: string;
  let prisma: PrismaService;
  let ocrQueue: Queue;
  beforeAll(async () => {
    // Start containers in parallel
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine").start(),
      new RedisContainer("redis:7-alpine").start(),
    ]);

    // Temp upload dir
    uploadDir = join(tmpdir(), `photo-e2e-${Date.now()}`);
    mkdirSync(join(uploadDir, 'originals'), { recursive: true });
    mkdirSync(join(uploadDir, 'processed'), { recursive: true });

    // Set env vars before AppModule loads
    process.env['DATABASE_URL'] = pgContainer.getConnectionUri();
    process.env['REDIS_HOST'] = '127.0.0.1';
    process.env['REDIS_PORT'] = String(redisContainer.getMappedPort(6379));
    process.env['UPLOAD_DIR'] = uploadDir;

    // Run Prisma migrations against the test DB
    execSync('npx prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: pgContainer.getConnectionUri() },
      stdio: 'pipe',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Prevent GpuFallbackService from creating BullMQ connections to external GPU queues
      .overrideProvider(GpuFallbackService)
      .useValue({ onModuleInit: () => {}, onModuleDestroy: async () => {} })
      // Mock GeminiOcrService — no real API key needed in E2E
      .overrideProvider(GeminiOcrService)
      .useValue({ extractText: async () => '', mergeTexts: async () => '' })
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(app.get(AppLogger));
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(AppLogger)));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    await app.init();

    prisma = app.get(PrismaService);
    ocrQueue = app.get<Queue>(getQueueToken('ocr'));
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([pgContainer.stop(), redisContainer.stop()]);
    rmSync(uploadDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean DB between tests
    await prisma.mergedOcrResult.deleteMany();
    await prisma.ocrResult.deleteMany();
    await prisma.photo.deleteMany();
    // Drain queue
    await ocrQueue.drain();
  });

  // ─── /health ────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  // ─── POST /upload ────────────────────────────────────────────────────────────

  describe('POST /upload', () => {
    it('accepts a JPEG and returns 202 PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', JPEG_FILE, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
        .expect(202);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.id).toBeDefined();
      expect(res.body.jobId).toBeDefined();
      expect(res.body.sha256).toHaveLength(64);
    });

    it('creates a Photo record in DB with PENDING status', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', JPEG_FILE, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
        .expect(202);

      const photo = await prisma.photo.findUnique({ where: { id: res.body.id as string } });
      expect(photo).not.toBeNull();
      // Status may advance to PROCESSING if the OCR worker picks up the job quickly
      expect(['PENDING', 'PROCESSING']).toContain(photo!.status);
      expect(photo!.originalName).toBe('receipt.jpg');
      expect(photo!.mimeType).toBe('image/jpeg');
    });

    it('enqueues a job in the OCR queue', async () => {
      const res = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', JPEG_FILE, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
        .expect(202);

      // Get job directly by ID — works regardless of current state
      const job = await ocrQueue.getJob(res.body.jobId as string);
      expect(job).toBeDefined();
      expect(job!.data.photoId).toBe(res.body.id);
      expect(job!.data.mimeType).toBe('image/jpeg');
    });

    it('returns 200 DUPLICATE for the same file uploaded twice', async () => {
      // First upload
      const first = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', JPEG_FILE, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
        .expect(202);

      // Second upload — same bytes
      const second = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', JPEG_FILE, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
        .expect(200);

      expect(second.body.status).toBe('DUPLICATE');
      expect(second.body.existingId).toBe(first.body.id);
    });

    it('rejects a non-image file with 415', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
      await request(app.getHttpServer())
        .post('/upload')
        .attach('file', pdfBuffer, { filename: 'doc.pdf', contentType: 'application/pdf' })
        .expect(415);
    });

    it('rejects a request with no file with 400', async () => {
      await request(app.getHttpServer())
        .post('/upload')
        .expect(400);
    });
  });

  // ─── GET /results ────────────────────────────────────────────────────────────

  describe('GET /results', () => {
    it('returns empty paginated response when no results', async () => {
      const res = await request(app.getHttpServer())
        .get('/results')
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
    });

    it('respects limit and offset query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/results?limit=5&offset=10')
        .expect(200);

      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(10);
    });

    it('rejects limit > 100 with 400', async () => {
      await request(app.getHttpServer())
        .get('/results?limit=200')
        .expect(400);
    });
  });

  // ─── GET /results/status/:photoId ────────────────────────────────────────────

  describe('GET /results/status/:photoId', () => {
    it('returns photo with PENDING status after upload', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', JPEG_FILE, { filename: 'r.jpg', contentType: 'image/jpeg' })
        .expect(202);

      const res = await request(app.getHttpServer())
        .get(`/results/status/${uploadRes.body.id as string}`)
        .expect(200);

      // Status may advance to PROCESSING if the OCR worker picks up the job quickly
      expect(['PENDING', 'PROCESSING']).toContain(res.body.status);
      expect(res.body.id).toBe(uploadRes.body.id);
    });

    it('returns 404 for unknown photoId', async () => {
      await request(app.getHttpServer())
        .get('/results/status/non-existent-id')
        .expect(404);
    });
  });

  // ─── GET /results/:id ────────────────────────────────────────────────────────

  describe('GET /results/:id', () => {
    it('returns 404 for unknown result id', async () => {
      await request(app.getHttpServer())
        .get('/results/non-existent-id')
        .expect(404);
    });
  });
});
