import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, SendResult, SmsProviderAdapter } from './provider.interface';

@Injectable()
export class TwilioSmsAdapter implements SmsProviderAdapter {
  readonly name = 'twilio';
  readonly channel = Channel.SMS;
  readonly supportedCountries = ['*']; // global

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      !!this.config.get<string>('TWILIO_AUTH_TOKEN') &&
      !!this.config.get<string>('TWILIO_FROM_NUMBER')
    );
  }

  supportsDlr(): boolean {
    return true;
  }

  send(_phone: string, _message: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      return Promise.resolve({
        success: false,
        error: 'Twilio SMS not configured',
        latencyMs: 0,
      });
    }
    // TODO: implement when Twilio keys are available
    return Promise.resolve({
      success: false,
      error: 'Twilio SMS adapter not implemented',
      latencyMs: 0,
    });
  }
}
