import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, SendResult, SmsProviderAdapter } from './provider.interface';

@Injectable()
export class TwilioVoiceAdapter implements SmsProviderAdapter {
  readonly name = 'twilio';
  readonly channel = Channel.VOICE;
  readonly supportedCountries = ['*'];

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      !!this.config.get<string>('TWILIO_AUTH_TOKEN') &&
      !!this.config.get<string>('TWILIO_VOICE_FROM')
    );
  }

  supportsDlr(): boolean {
    return true;
  }

  async send(_phone: string, _message: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Twilio Voice not configured', latencyMs: 0 };
    }
    // TODO: implement when Twilio Voice keys are available
    return { success: false, error: 'Twilio Voice adapter not implemented', latencyMs: 0 };
  }
}
