export enum Channel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  VOICE = 'VOICE',
}

export interface SendResult {
  success: boolean;
  providerRef?: string; // provider's request_id / message_sid
  error?: string;
  latencyMs: number;
}

export interface SmsProviderAdapter {
  readonly name: string; // 'fast2sms' | 'msg91' | 'twilio'
  readonly channel: Channel;
  readonly supportedCountries: string[]; // ['IN'] or ['*'] for global

  send(phone: string, message: string): Promise<SendResult>;
  supportsDlr(): boolean;
  isConfigured(): boolean; // false if env keys are missing
}
