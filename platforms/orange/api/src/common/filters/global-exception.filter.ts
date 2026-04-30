import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  error: {
    type: string;
    detail: string;
    status: number;
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      let detail: string;
      if (typeof response === 'string') {
        detail = response;
      } else if (typeof response === 'object' && response !== null) {
        const body = response as { message?: string | string[] };
        detail = Array.isArray(body.message) ? body.message[0] : (body.message ?? 'Something went wrong');
      } else {
        detail = 'Something went wrong';
      }

      res.status(status).json({
        error: {
          type: this.toType(status),
          detail,
          status,
        },
      } satisfies ErrorBody);
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        type: 'INTERNAL_ERROR',
        detail: 'Internal server error',
        status: 500,
      },
    } satisfies ErrorBody);
  }

  private toType(status: number): string {
    switch (status) {
      case 400: return 'VALIDATION_ERROR';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'UNPROCESSABLE';
      default:  return 'INTERNAL_ERROR';
    }
  }
}
