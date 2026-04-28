import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, status: HttpStatus) {
    super({ code, message, statusCode: status }, status);
    this.code = code;
  }
}

/**
 * Factory helpers — use these instead of throwing raw NestJS exceptions.
 * Provides typed error codes for consistent client-facing API responses.
 */
export const AppErrors = {
  // ─── Common ──────────────────────────────────────────────────────────────

  notFound: (resource: string) =>
    new AppException(
      ErrorCode.NOT_FOUND,
      `${resource} not found`,
      HttpStatus.NOT_FOUND,
    ),

  internal: (message = 'Internal server error') =>
    new AppException(
      ErrorCode.INTERNAL_ERROR,
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
    ),

  // ─── OTP service ─────────────────────────────────────────────────────────

  invalidPhone: (raw?: string) =>
    new AppException(
      ErrorCode.INVALID_PHONE,
      raw ? `Invalid phone number: ${raw}` : 'Invalid phone number',
      HttpStatus.BAD_REQUEST,
    ),

  otpCooldown: (waitSeconds: number) =>
    new AppException(
      ErrorCode.OTP_COOLDOWN,
      `Please wait ${waitSeconds}s before requesting a new OTP.`,
      HttpStatus.TOO_MANY_REQUESTS,
    ),

  otpRateLimit: (message: string) =>
    new AppException(
      ErrorCode.OTP_RATE_LIMIT,
      message,
      HttpStatus.TOO_MANY_REQUESTS,
    ),

  otpDeliveryFailed: () =>
    new AppException(
      ErrorCode.OTP_DELIVERY_FAILED,
      'Failed to deliver OTP. Please try again later.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),

  invalidWebhookPayload: (provider: string) =>
    new AppException(
      ErrorCode.INVALID_WEBHOOK_PAYLOAD,
      `Invalid ${provider} DLR payload`,
      HttpStatus.BAD_REQUEST,
    ),

  invalidWebhookSignature: (reason: 'missing' | 'invalid') =>
    new AppException(
      ErrorCode.INVALID_WEBHOOK_SIGNATURE,
      reason === 'missing' ? 'Missing webhook signature' : 'Invalid webhook signature',
      HttpStatus.BAD_REQUEST,
    ),

  // ─── Photo service ───────────────────────────────────────────────────────

  fileMissing: () =>
    new AppException(
      ErrorCode.FILE_MISSING,
      'No file provided',
      HttpStatus.BAD_REQUEST,
    ),

  invalidFileFormat: () =>
    new AppException(
      ErrorCode.INVALID_FILE_FORMAT,
      'Unsupported file format. Allowed: JPEG, PNG, WebP, HEIC, HEIF, TIFF, DNG',
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    ),

  uploadFailed: () =>
    new AppException(
      ErrorCode.UPLOAD_FAILED,
      'Failed to process upload. Please try again.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    ),
};
