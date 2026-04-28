import { Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { createHash } from 'crypto';
import { AppErrors } from '@fintech/shared-errors';

export interface PhoneInfo {
  e164: string;
  masked: string;
  hash: string;
  country: string;
  nationalNumber: string;
}

@Injectable()
export class PhoneService {
  parse(raw: string): PhoneInfo {
    const parsed = parsePhoneNumberFromString(raw);

    if (!parsed || !parsed.isValid()) {
      throw AppErrors.invalidPhone(raw);
    }

    const e164 = parsed.number;

    return {
      e164,
      masked: this.mask(e164),
      hash: this.hash(e164),
      country: parsed.country ?? 'UNKNOWN',
      nationalNumber: parsed.nationalNumber,
    };
  }

  // +919523924983 -> +91****4983
  private mask(e164: string): string {
    if (e164.length < 6) return '****';
    return e164.slice(0, e164.length - 6) + '****' + e164.slice(-4);
  }

  // SHA256 used as Redis key and DB lookup — never store raw phone in Redis
  private hash(e164: string): string {
    return createHash('sha256').update(e164).digest('hex');
  }
}
