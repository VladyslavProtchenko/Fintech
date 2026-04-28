import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '@fintech/shared-logger';
import { PrismaService } from '../prisma/prisma.service';
import { OtpStatus } from '../../generated/prisma/client';

const CTX = 'DlrTimeoutService';

@Injectable()
export class DlrTimeoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  // Runs every minute — marks SENT OTPs with no DLR as TIMEOUT
  @Cron(CronExpression.EVERY_MINUTE)
  async checkTimeouts(): Promise<void> {
    try {
      const timeoutMs = this.config.get<number>('DLR_TIMEOUT_MS', 10_000);
      const cutoff = new Date(Date.now() - timeoutMs);

      const result = await this.prisma.otpAuditLog.updateMany({
        where: {
          status: OtpStatus.SENT,
          createdAt: { lt: cutoff },
        },
        data: {
          status: OtpStatus.TIMEOUT,
          expiredAt: new Date(),
        },
      });

      if (result.count > 0) {
        this.logger.warn('OTPs marked as TIMEOUT — no DLR received', CTX, {
          count: result.count,
          timeoutMs,
          cutoff: cutoff.toISOString(),
        });
      }
    } catch (err) {
      this.logger.error('DLR timeout cron failed', err instanceof Error ? err : undefined, CTX, {
        error: err instanceof Error ? err.message : String(err),
      });
      // Do not rethrow — cron jobs must not throw to avoid NestJS scheduler crashes
    }
  }
}
