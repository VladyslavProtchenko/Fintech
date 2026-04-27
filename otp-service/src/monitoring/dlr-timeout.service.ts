import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OtpStatus } from '../../generated/prisma/client';

@Injectable()
export class DlrTimeoutService {
  private readonly logger = new Logger(DlrTimeoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Runs every minute — marks SENT OTPs with no DLR as TIMEOUT
  @Cron(CronExpression.EVERY_MINUTE)
  async checkTimeouts(): Promise<void> {
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
      this.logger.warn(`Marked ${result.count} OTP(s) as TIMEOUT (no DLR within ${timeoutMs}ms)`);
    }
  }
}
