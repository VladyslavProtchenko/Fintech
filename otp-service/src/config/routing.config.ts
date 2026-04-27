import { Channel } from '../providers/adapters/provider.interface';

// Channel priority per country — first channel is tried first
export const CHANNEL_PRIORITY: Record<string, Channel[]> = {
  IN: [Channel.SMS, Channel.WHATSAPP, Channel.VOICE],
  DEFAULT: [Channel.SMS, Channel.VOICE],
};

export interface ProviderConfig {
  name: string;
  channel: Channel;
  countries: string[]; // ['IN'] or ['*'] for global
}

// Provider registry — defines which providers are candidates for each channel+country.
// Order here is the initial priority before dynamic scoring kicks in.
// '*' means the provider handles any country.
export const PROVIDER_REGISTRY: ProviderConfig[] = [
  { name: 'fast2sms', channel: Channel.SMS,      countries: ['IN'] },
  { name: 'msg91',    channel: Channel.SMS,      countries: ['IN'] },
  { name: 'msg91',    channel: Channel.WHATSAPP, countries: ['IN'] },
  { name: 'msg91',    channel: Channel.VOICE,    countries: ['IN'] },
  { name: 'twilio',   channel: Channel.SMS,      countries: ['*']  },
  { name: 'twilio',   channel: Channel.WHATSAPP, countries: ['*']  },
  { name: 'twilio',   channel: Channel.VOICE,    countries: ['*']  },
];

export function getChannelPriority(country: string): Channel[] {
  return CHANNEL_PRIORITY[country] ?? CHANNEL_PRIORITY['DEFAULT'];
}

// Returns provider names registered for a given channel + country, in config order.
// Dynamic scoring will reorder them at runtime.
export function getProvidersForChannel(country: string, channel: Channel): string[] {
  return PROVIDER_REGISTRY
    .filter(
      (p) =>
        p.channel === channel &&
        (p.countries.includes(country) || p.countries.includes('*')),
    )
    .map((p) => p.name);
}
