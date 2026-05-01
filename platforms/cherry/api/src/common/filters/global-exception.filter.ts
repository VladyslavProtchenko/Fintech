import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PaymentServiceError } from '@fintech/payment-sdk';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string' ? body : (body as Record<string, unknown>).message ?? 'Error';
      res.status(status).json({ ok: false, reason: message, code: status });
      return;
    }

    if (exception instanceof PaymentServiceError) {
      const status = exception.isInsufficientFunds
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.BAD_GATEWAY;
      res.status(status).json({
        ok: false,
        reason: exception.isInsufficientFunds ? 'Insufficient credits' : 'Payment service error',
        code: status,
      });
      return;
    }

    console.error('[cherry GlobalExceptionFilter] Unhandled exception:', exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      reason: 'Internal server error',
      code: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
