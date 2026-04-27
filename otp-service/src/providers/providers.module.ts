import { Module } from '@nestjs/common';
import { Fast2SmsAdapter } from './adapters/fast2sms.adapter';
import { Msg91SmsAdapter } from './adapters/msg91-sms.adapter';
import { Msg91WhatsappAdapter } from './adapters/msg91-whatsapp.adapter';
import { Msg91VoiceAdapter } from './adapters/msg91-voice.adapter';
import { TwilioSmsAdapter } from './adapters/twilio-sms.adapter';
import { TwilioWhatsappAdapter } from './adapters/twilio-whatsapp.adapter';
import { TwilioVoiceAdapter } from './adapters/twilio-voice.adapter';
import { CircuitBreakerService } from './circuit-breaker.service';

export const PROVIDER_ADAPTERS = Symbol('PROVIDER_ADAPTERS');

@Module({
  providers: [
    Fast2SmsAdapter,
    Msg91SmsAdapter,
    Msg91WhatsappAdapter,
    Msg91VoiceAdapter,
    TwilioSmsAdapter,
    TwilioWhatsappAdapter,
    TwilioVoiceAdapter,
    CircuitBreakerService,
    {
      // Inject all adapters as a single array — easy to iterate in router
      provide: PROVIDER_ADAPTERS,
      useFactory: (
        fast2sms: Fast2SmsAdapter,
        msg91Sms: Msg91SmsAdapter,
        msg91Whatsapp: Msg91WhatsappAdapter,
        msg91Voice: Msg91VoiceAdapter,
        twilioSms: TwilioSmsAdapter,
        twilioWhatsapp: TwilioWhatsappAdapter,
        twilioVoice: TwilioVoiceAdapter,
      ) => [
        fast2sms,
        msg91Sms,
        msg91Whatsapp,
        msg91Voice,
        twilioSms,
        twilioWhatsapp,
        twilioVoice,
      ],
      inject: [
        Fast2SmsAdapter,
        Msg91SmsAdapter,
        Msg91WhatsappAdapter,
        Msg91VoiceAdapter,
        TwilioSmsAdapter,
        TwilioWhatsappAdapter,
        TwilioVoiceAdapter,
      ],
    },
  ],
  exports: [
    PROVIDER_ADAPTERS,
    CircuitBreakerService,
    Fast2SmsAdapter,
    Msg91SmsAdapter,
    Msg91WhatsappAdapter,
    Msg91VoiceAdapter,
    TwilioSmsAdapter,
    TwilioWhatsappAdapter,
    TwilioVoiceAdapter,
  ],
})
export class ProvidersModule {}
