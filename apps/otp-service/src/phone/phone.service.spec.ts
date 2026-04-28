import { PhoneService } from './phone.service';

describe('PhoneService', () => {
  const service = new PhoneService();

  describe('parse — valid numbers', () => {
    it('parses E.164 number correctly', () => {
      const result = service.parse('+12025551234');
      expect(result.e164).toBe('+12025551234');
      expect(result.country).toBe('US');
      expect(result.nationalNumber).toBe('2025551234');
    });

    it('returns masked phone', () => {
      const result = service.parse('+12025551234');
      // +12025551234 → +1202****1234
      expect(result.masked).toMatch(/\*{4}/);
      expect(result.masked).toContain('+1202');
    });

    it('returns 64-char SHA256 hash', () => {
      const result = service.parse('+12025551234');
      expect(result.hash).toHaveLength(64);
      expect(result.hash).toMatch(/^[0-9a-f]+$/);
    });

    it('hash is deterministic', () => {
      expect(service.parse('+12025551234').hash).toBe(service.parse('+12025551234').hash);
    });

    it('different phones produce different hashes', () => {
      expect(service.parse('+12025551234').hash).not.toBe(service.parse('+12025559999').hash);
    });

    it('parses Indian number with country code', () => {
      const result = service.parse('+919876543210');
      expect(result.country).toBe('IN');
      expect(result.e164).toBe('+919876543210');
    });
  });

  describe('parse — invalid numbers', () => {
    it('throws for non-numeric string', () => {
      expect(() => service.parse('not-a-phone')).toThrow();
    });

    it('throws for too short number', () => {
      expect(() => service.parse('+123')).toThrow();
    });

    it('throws for empty string', () => {
      expect(() => service.parse('')).toThrow();
    });
  });

  describe('masking', () => {
    it('masks middle digits and keeps first and last 4', () => {
      const { masked } = service.parse('+12025551234');
      expect(masked.endsWith('1234')).toBe(true);
      expect(masked).toContain('****');
    });
  });
});
