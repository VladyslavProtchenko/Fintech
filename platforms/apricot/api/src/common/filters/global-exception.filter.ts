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
      res.status(status).json({ message, code: this.toCode(status), statusCode: status });
      return;
    }

    if (exception instanceof PaymentServiceError) {
      const status = exception.isInsufficientFunds
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.BAD_GATEWAY;
      res.status(status).json({
        message: exception.message,
        code: exception.isInsufficientFunds ? 'INSUFFICIENT_FUNDS' : 'PAYMENT_SERVICE_ERROR',
        statusCode: status,
      });
      return;
    }

    console.error('[GlobalExceptionFilter] Unhandled exception:', exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }

  private toCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
    };
    return map[status] ?? 'ERROR';
  }
}
