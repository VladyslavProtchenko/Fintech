import type { PaymentServiceErrorBody } from './types';

export class PaymentServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly timestamp: string;
  readonly traceId?: string;

  constructor(body: PaymentServiceErrorBody) {
    super(body.error.message);
    this.name = 'PaymentServiceError';
    this.code = body.error.code;
    this.statusCode = body.error.statusCode;
    this.timestamp = body.error.timestamp;
    this.traceId = body.error.traceId;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isConflict(): boolean {
    return this.statusCode === 409;
  }

  get isDuplicate(): boolean {
    return this.statusCode === 409 && this.message.includes('already exists');
  }

  get isValidation(): boolean {
    return this.statusCode === 400;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isInsufficientFunds(): boolean {
    return this.statusCode === 422 && this.message.includes('Insufficient funds');
  }
}
