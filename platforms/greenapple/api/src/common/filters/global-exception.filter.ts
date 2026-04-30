import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
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

      let message: string;
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const body = response as { message?: string | string[] };
        message = Array.isArray(body.message) ? body.message[0] : (body.message ?? 'Something went wrong');
      } else {
        message = 'Something went wrong';
      }

      res.status(status).json({
        success: false,
        error: {
          code: this.toCode(status),
          message,
        },
      } satisfies ErrorBody);
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'ERR_INTERNAL',
        message: 'Internal server error',
      },
    } satisfies ErrorBody);
  }

  private toCode(status: number): string {
    switch (status) {
      case 400: return 'ERR_VALIDATION';
      case 401: return 'ERR_UNAUTHORIZED';
      case 403: return 'ERR_FORBIDDEN';
      case 404: return 'ERR_NOT_FOUND';
      case 409: return 'ERR_CONFLICT';
      case 422: return 'ERR_UNPROCESSABLE';
      default:  return 'ERR_INTERNAL';
    }
  }
}
