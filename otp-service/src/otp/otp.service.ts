import {
  Injectable,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PhoneService } from '../phone/phone.service';
import { ChannelOrchestratorService } from '../channels/channel-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpStatus, Channel as PrismaChannel } from '../../generated/prisma/client';

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
  private readonly logger = new Logger(OtpService.name);

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
  ) {}

  async send(
    rawPhone: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SendOtpResult> {
    const phone = this.phoneService.parse(rawPhone);

    await this.checkRateLimits(phone.hash, ipAddress);

    // Set cooldown BEFORE sending to prevent concurrent requests (race condition)
    await this.setCooldown(phone.hash);

    const code = this.generateCode();
    const requestId = randomUUID();
    const message = `Your OTP is ${code}. Valid for ${Math.floor(this.ttl / 60)} minutes. Do not share with anyone.`;

    const startMs = Date.now();
    const result = await this.orchestrator.send(phone.e164, message, phone.country);
    const durationMs = Date.now() - startMs;

    const status = result.success ? OtpStatus.SENT : OtpStatus.FAILED;

    if (result.success) {
      await this.storeOtp(phone.hash, { code, requestId, attempts: 0, createdAt: Date.now() });
      await this.incrementRateLimits(phone.hash, ipAddress);
    } else {
      // Remove cooldown if send failed — allow immediate retry
      await this.redis.del(`cooldown:${phone.hash}`);
    }

    // Persist audit log
    await this.prisma.otpAuditLog.create({
      data: {
        phone: phone.masked,
        phoneHash: phone.hash,
        country: phone.country,
        channel: (result.channel as string as PrismaChannel) ?? PrismaChannel.SMS,
        provider: result.provider ?? 'none',
        providerRef: result.providerRef,
        status,
        failoverChain: result.failoverChain as object[],
        attempts: 0,
        duration: durationMs,
        ipAddress,
        userAgent,
      },
    });

    if (!result.success) {
      throw new UnprocessableEntityException('Failed to deliver OTP. Please try again later.');
    }

    this.logger.log(`OTP sent to ${phone.masked} via ${result.channel}/${result.provider}`);

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
      return { success: false, attemptsLeft: 0 };
    }

    const payload: OtpPayload = JSON.parse(raw) as OtpPayload;

    if (payload.attempts >= this.maxAttempts) {
      await this.redis.del(key);
      return { success: false, attemptsLeft: 0 };
    }

    const match = this.safeCompare(code, payload.code);

    if (!match) {
      payload.attempts += 1;
      const attemptsLeft = this.maxAttempts - payload.attempts;

      if (attemptsLeft <= 0) {
        await this.redis.del(key);
        await this.updateAuditStatus(phone.hash, OtpStatus.FAILED, payload.attempts);
      } else {
        await this.storeOtp(phone.hash, payload);
      }

      return { success: false, attemptsLeft };
    }

    // Success — clean up
    await this.redis.del(key);
    await this.updateAuditStatus(phone.hash, OtpStatus.VERIFIED, payload.attempts + 1);

    this.logger.log(`OTP verified for ${phone.masked}`);
    return { success: true, attemptsLeft: this.maxAttempts - payload.attempts - 1 };
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

  private async storeOtp(phoneHash: string, payload: OtpPayload): Promise<void> {
    await this.redis.set(this.otpKey(phoneHash), JSON.stringify(payload), 'EX', this.ttl);
  }

  private async checkRateLimits(phoneHash: string, ipAddress?: string): Promise<void> {
    // Cooldown check
    const cooldownKey = `cooldown:${phoneHash}`;
    if (await this.redis.exists(cooldownKey)) {
      const ttl = await this.redis.ttl(cooldownKey);
      throw new HttpException(`Please wait ${ttl}s before requesting a new OTP.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Per-phone 10-min rate limit
    const rl10Key = `rl:10m:${phoneHash}`;
    const count10 = parseInt((await this.redis.get(rl10Key)) ?? '0', 10);
    if (count10 >= this.ratePer10Min) {
      throw new HttpException('Too many OTP requests. Try again in 10 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Per-phone hourly rate limit
    const rl1hKey = `rl:1h:${phoneHash}`;
    const count1h = parseInt((await this.redis.get(rl1hKey)) ?? '0', 10);
    if (count1h >= this.ratePerHour) {
      throw new HttpException('Hourly OTP limit reached. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Per-IP 10-min rate limit
    if (ipAddress) {
      const ipKey = `rl:ip:10m:${ipAddress}`;
      const ipCount = parseInt((await this.redis.get(ipKey)) ?? '0', 10);
      if (ipCount >= this.ipRatePer10Min) {
        throw new HttpException('Too many requests from this IP. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  private async setCooldown(phoneHash: string): Promise<void> {
    await this.redis.set(`cooldown:${phoneHash}`, '1', 'EX', this.cooldown);
  }

  private async incrementRateLimits(phoneHash: string, ipAddress?: string): Promise<void> {
    const pipeline = this.redis.pipeline();

    // 10-min window
    pipeline.incr(`rl:10m:${phoneHash}`);
    pipeline.expire(`rl:10m:${phoneHash}`, 600);

    // 1-hour window
    pipeline.incr(`rl:1h:${phoneHash}`);
    pipeline.expire(`rl:1h:${phoneHash}`, 3600);

    // IP rate limit
    if (ipAddress) {
      pipeline.incr(`rl:ip:10m:${ipAddress}`);
      pipeline.expire(`rl:ip:10m:${ipAddress}`, 600);
    }

    await pipeline.exec();
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
      this.logger.warn(`Failed to update audit log: ${String(err)}`);
    }
  }

  private otpKey(phoneHash: string): string {
    return `otp:${phoneHash}`;
  }
}
