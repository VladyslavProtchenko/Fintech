import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OtpStatus, Prisma } from '../../generated/prisma/client';

export type DlrStatus = 'delivered' | 'failed' | 'undelivered' | 'unknown';

export interface NormalizedDlr {
  provider: string;
  providerRef: string;
  status: DlrStatus;
  rawPayload: Prisma.InputJsonValue;
}

// Twilio MessageStatus → our status
const TWILIO_STATUS_MAP: Record<string, DlrStatus> = {
  delivered: 'delivered',
  sent: 'unknown',      // accepted by carrier, not yet delivered
  failed: 'failed',
  undelivered: 'undelivered',
};

// MSG91 status codes → our status
const MSG91_STATUS_MAP: Record<string, DlrStatus> = {
  '1': 'delivered',
  '2': 'failed',
  '3': 'failed',
  '9': 'failed',
  '17': 'failed',
  '26': 'failed',
  '34': 'failed',
};

@Injectable()
export class DlrService {
  private readonly logger = new Logger(DlrService.name);

  constructor(private readonly prisma: PrismaService) {}

  normalizeTwilio(payload: Prisma.InputJsonObject): NormalizedDlr | null {
    const providerRef = (payload['MessageSid'] ?? payload['SmsSid']) as string | undefined;
    const rawStatus = payload['MessageStatus'] as string | undefined;

    if (!providerRef || !rawStatus) {
      this.logger.warn('Twilio DLR missing MessageSid or MessageStatus');
      return null;
    }

    return {
      provider: 'twilio',
      providerRef,
      status: TWILIO_STATUS_MAP[rawStatus] ?? 'unknown',
      rawPayload: payload,
    };
  }

  normalizeMsg91(payload: Prisma.InputJsonObject): NormalizedDlr | null {
    const providerRef = payload['requestId'] as string | undefined;
    const rawStatus = String(payload['status'] ?? '');

    if (!providerRef) {
      this.logger.warn('MSG91 DLR missing requestId');
      return null;
    }

    return {
      provider: 'msg91',
      providerRef,
      status: MSG91_STATUS_MAP[rawStatus] ?? 'unknown',
      rawPayload: payload,
    };
  }

  async process(dlr: NormalizedDlr): Promise<void> {
    // Persist raw callback first — never lose data
    await this.prisma.dlrCallback.create({
      data: {
        provider: dlr.provider,
        providerRef: dlr.providerRef,
        rawPayload: dlr.rawPayload,
        status: dlr.status,
      },
    });

    // Map DLR status → audit log status
    let otpStatus: OtpStatus | null = null;

    if (dlr.status === 'delivered') {
      otpStatus = OtpStatus.DELIVERED;
    } else if (dlr.status === 'failed' || dlr.status === 'undelivered') {
      otpStatus = OtpStatus.FAILED;
    }

    // Only update if we have a meaningful status change
    if (otpStatus !== null) {
      const updated = await this.prisma.otpAuditLog.updateMany({
        where: {
          providerRef: dlr.providerRef,
          status: OtpStatus.SENT, // only update if still in SENT state
        },
        data: { status: otpStatus },
      });

      if (updated.count > 0) {
        this.logger.log(
          `DLR ${dlr.provider}/${dlr.providerRef}: ${dlr.status} → ${otpStatus}`,
        );
      }
    }
  }
}
