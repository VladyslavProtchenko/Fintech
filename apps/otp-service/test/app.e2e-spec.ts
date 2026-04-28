import { execSync } from 'child_process';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { AppModule } from '../src/app.module';
import { AppLogger } from '@fintech/shared-logger';
import { GlobalExceptionFilter } from '@fintech/shared-errors';
import Redis from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChannelOrchestratorService } from '../src/channels/channel-orchestrator.service';
import { REDIS_CLIENT } from '@fintech/shared-redis';
import { OtpStatus } from '../generated/prisma/client';

// Captured OTP code from the mock — allows verify tests to use the real code
let capturedCode: string | null = null;

const mockOrchestrator = {
  send: jest.fn().mockImplementation((_phone: string, message: string) => {
    // Extract the OTP code from the message "Your OTP is XXXXXX. Valid for..."
    const match = message.match(/Your OTP is (\d+)/);
    capturedCode = match ? match[1] : null;
    return Promise.resolve({
      success: true,
      channel: 'SMS',
      provider: 'twilio',
      providerRef: `ref-${Date.now()}`,
      latencyMs: 50,
      failoverChain: [],
    });
  }),
};

describe('otp-service (e2e)', () => {
  let app: INestApplication;
  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedRedisContainer;
  let prisma: PrismaService;

  const TEST_PHONE = '+12025551234';

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer("postgres:16-alpine").start(),
      new RedisContainer("redis:7-alpine").start(),
    ]);

    process.env['DATABASE_URL'] = pgContainer.getConnectionUri();
    // Force IPv4 — Node.js v25 resolves 'localhost' to ::1 (IPv6) first,
    // but Docker-mapped ports only listen on 127.0.0.1
    process.env['REDIS_HOST'] = '127.0.0.1';
    process.env['REDIS_PORT'] = String(redisContainer.getMappedPort(6379));
    // Shorten TTL and cooldown; raise rate limits so rapid test runs don't get blocked
    process.env['OTP_TTL_SECONDS'] = '300';
    process.env['OTP_COOLDOWN_SECONDS'] = '0';
    process.env['OTP_RATE_LIMIT_PER_10MIN'] = '100';
    process.env['OTP_RATE_LIMIT_PER_HOUR'] = '200';
    process.env['OTP_IP_RATE_LIMIT_PER_10MIN'] = '200';

    execSync('npx prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: pgContainer.getConnectionUri() },
      stdio: 'pipe',
    });

    const redisClient = new Redis({
      host: '127.0.0.1',
      port: redisContainer.getMappedPort(6379),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      family: 4,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Replace SMS orchestrator — no real providers needed in E2E
      .overrideProvider(ChannelOrchestratorService)
      .useValue(mockOrchestrator)
      // Provide Redis client directly to bypass ConfigService port resolution issue
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisClient)
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(app.get(AppLogger));
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(AppLogger)));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    await app.init();
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.quit().catch(() => {});
    await app.close();
    await Promise.all([pgContainer.stop(), redisContainer.stop()]);
  });

  afterEach(async () => {
    // Clean DB and Redis state between tests
    await prisma.otpAuditLog.deleteMany();
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.flushdb();
    jest.clearAllMocks();
    capturedCode = null;
  });

  // ─── /health ────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  // ─── POST /otp/send ──────────────────────────────────────────────────────────

  describe('POST /otp/send', () => {
    it('returns 200 with masked phone and expiresIn', async () => {
      const res = await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phone: TEST_PHONE })
        .expect(200);

      expect(res.body.maskedPhone).toMatch(/\*{4}/);
      expect(res.body.channel).toBe('SMS');
      expect(res.body.provider).toBe('twilio');
      expect(res.body.expiresIn).toBe(300);
      expect(res.body.requestId).toBeDefined();
    });

    it('creates an audit log entry with status SENT', async () => {
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phone: TEST_PHONE })
        .expect(200);

      const log = await prisma.otpAuditLog.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(log).not.toBeNull();
      expect(log!.status).toBe(OtpStatus.SENT);
      expect(log!.provider).toBe('twilio');
    });

    it('rejects invalid phone number with 400', async () => {
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phone: 'not-a-phone' })
        .expect(400);
    });

    it('rejects missing phone with 400', async () => {
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({})
        .expect(400);
    });
  });

  // ─── POST /otp/verify ────────────────────────────────────────────────────────

  describe('POST /otp/verify', () => {
    beforeEach(async () => {
      // Send OTP before each verify test
      await request(app.getHttpServer())
        .post('/otp/send')
        .send({ phone: TEST_PHONE })
        .expect(200);
    });

    it('verifies correct OTP code and returns success=true', async () => {
      expect(capturedCode).not.toBeNull();

      const res = await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phone: TEST_PHONE, code: capturedCode })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('updates audit log to VERIFIED on success', async () => {
      const res = await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phone: TEST_PHONE, code: capturedCode })
        .expect(200);

      expect(res.body.success).toBe(true);

      const log = await prisma.otpAuditLog.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(log!.status).toBe(OtpStatus.VERIFIED);
    });

    it('returns success=false with attemptsLeft on wrong code', async () => {
      const res = await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phone: TEST_PHONE, code: '000000' })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.attemptsLeft).toBe(2); // 3 max - 1 attempt = 2 left
    });

    it('marks audit as FAILED after 3 wrong attempts', async () => {
      // 3 wrong attempts
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/otp/verify')
          .send({ phone: TEST_PHONE, code: '000000' })
          .expect(200);
      }

      const log = await prisma.otpAuditLog.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(log!.status).toBe(OtpStatus.FAILED);
    });

    it('returns success=false and updates audit to TIMEOUT for expired OTP', async () => {
      // Verify a phone that never sent OTP — simulates expired/missing OTP
      const res = await request(app.getHttpServer())
        .post('/otp/verify')
        .send({ phone: '+12025559999', code: '123456' })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.attemptsLeft).toBe(0);
    });
  });
});
