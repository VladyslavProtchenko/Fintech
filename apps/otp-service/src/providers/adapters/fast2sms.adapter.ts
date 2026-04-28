import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '@fintech/shared-logger';
import { Channel, SendResult, SmsProviderAdapter } from './provider.interface';

const CTX = 'Fast2SmsAdapter';

interface Fast2SmsResponse {
  return: boolean;
  request_id?: string;
  message: string[];
}

@Injectable()
export class Fast2SmsAdapter implements SmsProviderAdapter {
  readonly name = 'fast2sms';
  readonly channel = Channel.SMS;
  readonly supportedCountries = ['IN'];

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('FAST2SMS_API_KEY');
  }

  supportsDlr(): boolean {
    return false; // quick route has no DLR
  }

  async send(phone: string, message: string): Promise<SendResult> {
    const apiKey = this.config.get<string>('FAST2SMS_API_KEY')!;
    const route = this.config.get<string>('FAST2SMS_ROUTE', 'q');
    const senderId = this.config.get<string>('FAST2SMS_SENDER_ID', 'FSTSMS');

    // Fast2SMS expects 10-digit national number without country code
    const nationalNumber = phone.replace(/^\+91/, '');

    const body =
      route === 'dlt'
        ? {
            route: 'dlt',
            sender_id: senderId,
            message: this.config.get<string>('FAST2SMS_DLT_TEMPLATE_ID', ''),
            variables_values: this.extractOtp(message),
            flash: 0,
            numbers: nationalNumber,
          }
        : {
            route: 'q',
            message,
            language: 'english',
            flash: 0,
            numbers: nationalNumber,
          };

    const start = Date.now();

    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorType = response.status === 401 || response.status === 403
          ? 'auth_error'
          : 'http_error';

        this.logger.warn('Fast2SMS HTTP error', CTX, {
          status: response.status,
          errorType,
          latencyMs,
          route,
        });
        return { success: false, error: `HTTP ${response.status}`, latencyMs };
      }

      const data = (await response.json()) as Fast2SmsResponse;

      if (!data.return) {
        const error = data.message.join(', ');
        this.logger.warn('Fast2SMS API rejected request', CTX, {
          error,
          latencyMs,
          route,
        });
        return { success: false, error, latencyMs };
      }

      this.logger.debug('Fast2SMS send succeeded', CTX, {
        providerRef: data.request_id,
        latencyMs,
        route,
      });

      return { success: true, providerRef: data.request_id, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;

      const isTimeout =
        err instanceof DOMException && err.name === 'TimeoutError';
      const errorType = isTimeout ? 'timeout' : 'network_error';
      const error = err instanceof Error ? err.message : 'unknown';

      this.logger.error(
        'Fast2SMS send failed',
        err instanceof Error ? err : undefined,
        CTX,
        { errorType, latencyMs, route, error },
      );

      return { success: false, error, latencyMs };
    }
  }

  // Extract OTP digits from message text for DLT variables_values
  private extractOtp(message: string): string {
    const match = /\b\d{4,8}\b/.exec(message);
    return match ? match[0] : '';
  }
}
