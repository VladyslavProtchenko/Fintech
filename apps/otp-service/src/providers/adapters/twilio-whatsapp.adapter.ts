import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, SendResult, SmsProviderAdapter } from './provider.interface';

@Injectable()
export class TwilioWhatsappAdapter implements SmsProviderAdapter {
  readonly name = 'twilio';
  readonly channel = Channel.WHATSAPP;
  readonly supportedCountries = ['*'];

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      !!this.config.get<string>('TWILIO_AUTH_TOKEN') &&
      !!this.config.get<string>('TWILIO_WHATSAPP_FROM')
    );
  }

  supportsDlr(): boolean {
    return true;
  }

  send(_phone: string, _message: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      return Promise.resolve({
        success: false,
        error: 'Twilio WhatsApp not configured',
        latencyMs: 0,
      });
    }
    // TODO: implement when Twilio WhatsApp keys are available
    return Promise.resolve({
      success: false,
      error: 'Twilio WhatsApp adapter not implemented',
      latencyMs: 0,
    });
  }
}
