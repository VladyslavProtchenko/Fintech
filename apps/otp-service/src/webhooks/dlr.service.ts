import { Injectable } from '@nestjs/common';
import { AppLogger } from '@fintech/shared-logger';
import { PrismaService } from '../prisma/prisma.service';
import { OtpStatus, Prisma } from '../../generated/prisma/client';

const CTX = 'DlrService';

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
  sent: 'unknown', // accepted by carrier, not yet delivered
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  normalizeTwilio(payload: Prisma.InputJsonObject): NormalizedDlr | null {
    const providerRef = (payload['MessageSid'] ?? payload['SmsSid']) as
      | string
      | undefined;
    const rawStatus = payload['MessageStatus'] as string | undefined;

    if (!providerRef || !rawStatus) {
      this.logger.warn('Twilio DLR missing required fields', CTX, {
        hasSid: !!providerRef,
        hasStatus: !!rawStatus,
      });
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
    const statusVal = payload['status'];
    const rawStatus =
      typeof statusVal === 'string' || typeof statusVal === 'number'
        ? String(statusVal)
        : '';

    if (!providerRef) {
      this.logger.warn('MSG91 DLR missing requestId', CTX, { rawStatus });
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
    try {
      await this.prisma.dlrCallback.create({
        data: {
          provider: dlr.provider,
          providerRef: dlr.providerRef,
          rawPayload: dlr.rawPayload,
          status: dlr.status,
        },
      });
    } catch (err) {
      this.logger.error('Failed to persist DLR callback', err instanceof Error ? err : undefined, CTX, {
        provider: dlr.provider,
        providerRef: dlr.providerRef,
        status: dlr.status,
        error: err instanceof Error ? err.message : String(err),
      });
      // Rethrow — if we can't persist the callback, we should return 500
      // so the provider retries delivery
      throw err;
    }

    // Map DLR status → audit log status
    let otpStatus: OtpStatus | null = null;

    if (dlr.status === 'delivered') {
      otpStatus = OtpStatus.DELIVERED;
    } else if (dlr.status === 'failed' || dlr.status === 'undelivered') {
      otpStatus = OtpStatus.FAILED;
    }

    if (otpStatus === null) {
      this.logger.debug('DLR received — no audit update needed', CTX, {
        provider: dlr.provider,
        providerRef: dlr.providerRef,
        status: dlr.status,
      });
      return;
    }

    try {
      const updated = await this.prisma.otpAuditLog.updateMany({
        where: {
          providerRef: dlr.providerRef,
          status: OtpStatus.SENT, // only update if still in SENT state
        },
        data: { status: otpStatus },
      });

      this.logger.log('DLR processed', CTX, {
        provider: dlr.provider,
        providerRef: dlr.providerRef,
        dlrStatus: dlr.status,
        auditStatus: otpStatus,
        updatedRecords: updated.count,
      });
    } catch (err) {
      this.logger.error('Failed to update audit log from DLR', err instanceof Error ? err : undefined, CTX, {
        provider: dlr.provider,
        providerRef: dlr.providerRef,
        targetStatus: otpStatus,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
