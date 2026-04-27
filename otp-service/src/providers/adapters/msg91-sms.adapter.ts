import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, SendResult, SmsProviderAdapter } from './provider.interface';

@Injectable()
export class Msg91SmsAdapter implements SmsProviderAdapter {
  readonly name = 'msg91';
  readonly channel = Channel.SMS;
  readonly supportedCountries = ['IN'];

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('MSG91_AUTH_KEY');
  }

  supportsDlr(): boolean {
    return true;
  }

  async send(_phone: string, _message: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'MSG91_AUTH_KEY not configured', latencyMs: 0 };
    }
    // TODO: implement when MSG91_AUTH_KEY is available
    return { success: false, error: 'MSG91 SMS adapter not implemented', latencyMs: 0 };
  }
}
