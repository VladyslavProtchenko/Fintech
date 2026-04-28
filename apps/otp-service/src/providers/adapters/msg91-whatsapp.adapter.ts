import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, SendResult, SmsProviderAdapter } from './provider.interface';

@Injectable()
export class Msg91WhatsappAdapter implements SmsProviderAdapter {
  readonly name = 'msg91';
  readonly channel = Channel.WHATSAPP;
  readonly supportedCountries = ['IN'];

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('MSG91_AUTH_KEY') &&
      !!this.config.get<string>('MSG91_WHATSAPP_TEMPLATE_ID')
    );
  }

  supportsDlr(): boolean {
    return true;
  }

  send(_phone: string, _message: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      return Promise.resolve({
        success: false,
        error: 'MSG91 WhatsApp not configured',
        latencyMs: 0,
      });
    }
    // TODO: implement when MSG91 WhatsApp keys are available
    return Promise.resolve({
      success: false,
      error: 'MSG91 WhatsApp adapter not implemented',
      latencyMs: 0,
    });
  }
}
