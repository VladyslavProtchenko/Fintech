import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Redis } from 'ioredis';
import { AppLogger } from '@fintech/shared-logger';
import { AppErrors } from '@fintech/shared-errors';
import { REDIS_CLIENT } from '@fintech/shared-redis';
import { PhoneService } from '../phone/phone.service';
import { ChannelOrchestratorService } from '../channels/channel-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  OtpStatus,
  Channel as PrismaChannel,
  Prisma,
} from '../../generated/prisma/client';

const CTX = 'OtpService';

interface OtpPayload {
  code: string;
  requestId: string;
  attempts: number;
  createdAt: number;
}

export interface SendOtpResult {
  requestId: string;
  maskedPhone: string;
  channel: string;
  provider: string;
  expiresIn: number;
}

export interface VerifyOtpResult {
  success: boolean;
  attemptsLeft: number;
}

@Injectable()
export class OtpService {
  private get otpLength(): number {
    return this.config.get<number>('OTP_LENGTH', 6);
  }
  private get ttl(): number {
    return this.config.get<number>('OTP_TTL_SECONDS', 300);
  }
  private get maxAttempts(): number {
    return this.config.get<number>('OTP_MAX_ATTEMPTS', 3);
  }
  private get ratePer10Min(): number {
    return this.config.get<number>('OTP_RATE_LIMIT_PER_10MIN', 5);
  }
  private get ratePerHour(): number {
    return this.config.get<number>('OTP_RATE_LIMIT_PER_HOUR', 10);
  }
  private get cooldown(): number {
    return this.config.get<number>('OTP_COOLDOWN_SECONDS', 30);
  }
  private get ipRatePer10Min(): number {
    return this.config.get<number>('OTP_IP_RATE_LIMIT_PER_10MIN', 20);
  }

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly phoneService: PhoneService,
    private readonly orchestrator: ChannelOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async send(
    rawPhone: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SendOtpResult> {
    const phone = this.phoneService.parse(rawPhone);

    this.logger.debug('OTP send request', CTX, {
      phoneHash: phone.hash.slice(0, 8),
      country: phone.country,
      ip: ipAddress,
    });

    await this.checkRateLimits(phone.hash, ipAddress);

    // Set cooldown BEFORE sending to prevent concurrent requests (race condition)
    await this.setCooldown(phone.hash);

    const code = this.generateCode();
    const requestId = randomUUID();
    const message = `Your OTP is ${code}. Valid for ${Math.floor(this.ttl / 60)} minutes. Do not share with anyone.`;

    const startMs = Date.now();
    const result = await this.orchestrator.send(
      phone.e164,
      message,
      phone.country,
    );
    const durationMs = Date.now() - startMs;

    const status = result.success ? OtpStatus.SENT : OtpStatus.FAILED;

    if (result.success) {
      await this.storeOtp(phone.hash, {
        code,
        requestId,
        attempts: 0,
        createdAt: Date.now(),
      });
      await this.incrementRateLimits(phone.hash, ipAddress);
    } else {
      // Remove cooldown if send failed — allow immediate retry
      try {
        await this.redis.del(`cooldown:${phone.hash}`);
      } catch (err) {
        this.logger.warn('Failed to remove cooldown after send failure', CTX, {
          phoneHash: phone.hash.slice(0, 8),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Persist audit log — non-blocking, do not fail the request if this fails
    try {
      await this.prisma.otpAuditLog.create({
        data: {
          phone: phone.masked,
          phoneHash: phone.hash,
          country: phone.country,
          channel:
            (result.channel as string as PrismaChannel) ?? PrismaChannel.SMS,
          provider: result.provider ?? 'none',
          providerRef: result.providerRef,
          status,
          failoverChain: result.failoverChain as unknown as Prisma.InputJsonValue,
          attempts: 0,
          duration: durationMs,
          ipAddress,
          userAgent,
        },
      });
    } catch (err) {
      this.logger.error('Failed to persist OTP audit log', err instanceof Error ? err : undefined, CTX, {
        phoneHash: phone.hash.slice(0, 8),
        status,
        provider: result.provider,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!result.success) {
      this.logger.warn('OTP delivery failed — all providers exhausted', CTX, {
        phoneHash: phone.hash.slice(0, 8),
        country: phone.country,
        durationMs,
        failoverChain: result.failoverChain,
      });
      throw AppErrors.otpDeliveryFailed();
    }

    this.logger.log('OTP sent', CTX, {
      phone: phone.masked,
      requestId,
      channel: result.channel,
      provider: result.provider,
      country: phone.country,
      latencyMs: durationMs,
    });

    return {
      requestId,
      maskedPhone: phone.masked,
      channel: result.channel!,
      provider: result.provider!,
      expiresIn: this.ttl,
    };
  }

  async verify(rawPhone: string, code: string): Promise<VerifyOtpResult> {
    const phone = this.phoneService.parse(rawPhone);
    const key = this.otpKey(phone.hash);
    const raw = await this.redis.get(key);

    if (!raw) {
      this.logger.debug('OTP not found — expired or never sent', CTX, {
        phoneHash: phone.hash.slice(0, 8),
      });
      await this.updateAuditStatus(phone.hash, OtpStatus.TIMEOUT, 0);
      return { success: false, attemptsLeft: 0 };
    }

    let payload: OtpPayload;
    try {
      payload = JSON.parse(raw) as OtpPayload;
    } catch {
      this.logger.error('Corrupted OTP data in Redis — deleting key', undefined, CTX, {
        phoneHash: phone.hash.slice(0, 8),
      });
      await this.redis.del(key).catch(() => undefined);
      return { success: false, attemptsLeft: 0 };
    }

    if (payload.attempts >= this.maxAttempts) {
      await this.redis.del(key);
      this.logger.warn('OTP verify blocked — max attempts reached', CTX, {
        phoneHash: phone.hash.slice(0, 8),
        requestId: payload.requestId,
        attempts: payload.attempts,
      });
      return { success: false, attemptsLeft: 0 };
    }

    const match = this.safeCompare(code, payload.code);

    if (!match) {
      payload.attempts += 1;
      const attemptsLeft = this.maxAttempts - payload.attempts;

      this.logger.debug('OTP code mismatch', CTX, {
        phoneHash: phone.hash.slice(0, 8),
        requestId: payload.requestId,
        attempt: payload.attempts,
        attemptsLeft,
      });

      if (attemptsLeft <= 0) {
        await this.redis.del(key);
        await this.updateAuditStatus(
          phone.hash,
          OtpStatus.FAILED,
          payload.attempts,
        );
        this.logger.warn('OTP invalidated — attempts exhausted', CTX, {
          phoneHash: phone.hash.slice(0, 8),
          requestId: payload.requestId,
        });
      } else {
        await this.storeOtp(phone.hash, payload);
      }

      return { success: false, attemptsLeft };
    }

    // Success — clean up
    await this.redis.del(key);
    await this.updateAuditStatus(
      phone.hash,
      OtpStatus.VERIFIED,
      payload.attempts + 1,
    );

    this.logger.log('OTP verified', CTX, {
      phone: phone.masked,
      requestId: payload.requestId,
      attempts: payload.attempts + 1,
    });

    return {
      success: true,
      attemptsLeft: this.maxAttempts - payload.attempts - 1,
    };
  }

  private generateCode(): string {
    const max = Math.pow(10, this.otpLength);
    return randomInt(0, max).toString().padStart(this.otpLength, '0');
  }

  private safeCompare(input: string, stored: string): boolean {
    try {
      const a = Buffer.from(input.padEnd(8, '\0'));
      const b = Buffer.from(stored.padEnd(8, '\0'));
      return a.length === b.length && timingSafeEqual(a, b) && input === stored;
    } catch {
      return false;
    }
  }

  private async storeOtp(
    phoneHash: string,
    payload: OtpPayload,
  ): Promise<void> {
    try {
      await this.redis.set(
        this.otpKey(phoneHash),
        JSON.stringify(payload),
        'EX',
        this.ttl,
      );
    } catch (err) {
      this.logger.error('Failed to store OTP in Redis', err instanceof Error ? err : undefined, CTX, {
        phoneHash: phoneHash.slice(0, 8),
        requestId: payload.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async checkRateLimits(
    phoneHash: string,
    ipAddress?: string,
  ): Promise<void> {
    // Cooldown check
    const cooldownKey = `cooldown:${phoneHash}`;
    if (await this.redis.exists(cooldownKey)) {
      const ttl = await this.redis.ttl(cooldownKey);
      this.logger.debug('OTP request blocked by cooldown', CTX, {
        phoneHash: phoneHash.slice(0, 8),
        cooldownTtl: ttl,
      });
      throw AppErrors.otpCooldown(ttl);
    }

    // Per-phone 10-min rate limit
    const rl10Key = `rl:10m:${phoneHash}`;
    const count10 = parseInt((await this.redis.get(rl10Key)) ?? '0', 10);
    if (count10 >= this.ratePer10Min) {
      this.logger.warn('OTP request blocked — 10min rate limit', CTX, {
        phoneHash: phoneHash.slice(0, 8),
        count: count10,
        limit: this.ratePer10Min,
      });
      throw AppErrors.otpRateLimit('Too many OTP requests. Try again in 10 minutes.');
    }

    // Per-phone hourly rate limit
    const rl1hKey = `rl:1h:${phoneHash}`;
    const count1h = parseInt((await this.redis.get(rl1hKey)) ?? '0', 10);
    if (count1h >= this.ratePerHour) {
      this.logger.warn('OTP request blocked — hourly rate limit', CTX, {
        phoneHash: phoneHash.slice(0, 8),
        count: count1h,
        limit: this.ratePerHour,
      });
      throw AppErrors.otpRateLimit('Hourly OTP limit reached. Try again later.');
    }

    // Per-IP 10-min rate limit
    if (ipAddress) {
      const ipKey = `rl:ip:10m:${ipAddress}`;
      const ipCount = parseInt((await this.redis.get(ipKey)) ?? '0', 10);
      if (ipCount >= this.ipRatePer10Min) {
        this.logger.warn('OTP request blocked — IP rate limit', CTX, {
          ip: ipAddress,
          count: ipCount,
          limit: this.ipRatePer10Min,
        });
        throw AppErrors.otpRateLimit('Too many requests from this IP. Try again later.');
      }
    }
  }

  private async setCooldown(phoneHash: string): Promise<void> {
    if (this.cooldown <= 0) return;
    try {
      await this.redis.set(`cooldown:${phoneHash}`, '1', 'EX', this.cooldown);
    } catch (err) {
      this.logger.error('Failed to set OTP cooldown in Redis', err instanceof Error ? err : undefined, CTX, {
        phoneHash: phoneHash.slice(0, 8),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async incrementRateLimits(
    phoneHash: string,
    ipAddress?: string,
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      pipeline.incr(`rl:10m:${phoneHash}`);
      pipeline.expire(`rl:10m:${phoneHash}`, 600);

      pipeline.incr(`rl:1h:${phoneHash}`);
      pipeline.expire(`rl:1h:${phoneHash}`, 3600);

      if (ipAddress) {
        pipeline.incr(`rl:ip:10m:${ipAddress}`);
        pipeline.expire(`rl:ip:10m:${ipAddress}`, 600);
      }

      await pipeline.exec();
    } catch (err) {
      // Non-fatal: rate limits may be stale but OTP was already sent
      this.logger.error('Failed to increment rate limit counters', err instanceof Error ? err : undefined, CTX, {
        phoneHash: phoneHash.slice(0, 8),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async updateAuditStatus(
    phoneHash: string,
    status: OtpStatus,
    attempts: number,
  ): Promise<void> {
    try {
      await this.prisma.otpAuditLog.updateMany({
        where: { phoneHash, status: OtpStatus.SENT },
        data: {
          status,
          attempts,
          verifiedAt: status === OtpStatus.VERIFIED ? new Date() : undefined,
        },
      });
    } catch (err) {
      this.logger.warn('Failed to update OTP audit status', CTX, {
        phoneHash: phoneHash.slice(0, 8),
        targetStatus: status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private otpKey(phoneHash: string): string {
    return `otp:${phoneHash}`;
  }
}
