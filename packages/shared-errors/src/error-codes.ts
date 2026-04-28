export enum ErrorCode {
  // ─── Common ────────────────────────────────────────────────────────────────
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // ─── OTP service ───────────────────────────────────────────────────────────
  INVALID_PHONE = 'INVALID_PHONE',
  OTP_COOLDOWN = 'OTP_COOLDOWN',
  OTP_RATE_LIMIT = 'OTP_RATE_LIMIT',
  OTP_DELIVERY_FAILED = 'OTP_DELIVERY_FAILED',
  INVALID_WEBHOOK_PAYLOAD = 'INVALID_WEBHOOK_PAYLOAD',
  INVALID_WEBHOOK_SIGNATURE = 'INVALID_WEBHOOK_SIGNATURE',

  // ─── Photo service ─────────────────────────────────────────────────────────
  FILE_MISSING = 'FILE_MISSING',
  INVALID_FILE_FORMAT = 'INVALID_FILE_FORMAT',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}
