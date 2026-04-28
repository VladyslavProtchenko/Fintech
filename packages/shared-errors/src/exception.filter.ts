import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger, TraceContext } from '@fintech/shared-logger';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';

const CTX = 'GlobalExceptionFilter';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
    traceId?: string;
  };
}

// Maps standard HTTP status codes to our error codes for non-AppException paths
const HTTP_CODE_MAP: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.INTERNAL_ERROR,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_ERROR,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const traceId = TraceContext.getTraceId();

    // ── AppException (our typed errors) ─────────────────────────────────────
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as { code: ErrorCode; message: string };

      // Only log 5xx — 4xx are expected client errors, no need to fill logs
      if (status >= 500) {
        this.logger.error('Server error', exception, CTX, {
          code: body.code,
          path: req.url,
          method: req.method,
          traceId,
        });
      }

      res.status(status).json(this.format(body.code, body.message, status, traceId));
      return;
    }

    // ── NestJS built-in HttpException (ValidationPipe, guards, etc.) ─────────
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const { code, message } = this.extractFromHttpException(status, raw);

      if (status >= 500) {
        this.logger.error('HttpException 5xx', exception, CTX, {
          path: req.url,
          method: req.method,
          traceId,
        });
      }

      res.status(status).json(this.format(code, message, status, traceId));
      return;
    }

    // ── Unexpected / unhandled Error ─────────────────────────────────────────
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception : undefined,
      CTX,
      {
        path: req.url,
        method: req.method,
        traceId,
        error: exception instanceof Error ? exception.message : String(exception),
      },
    );

    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        this.format(
          ErrorCode.INTERNAL_ERROR,
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          traceId,
        ),
      );
  }

  /**
   * Extracts a typed error code and human-readable message from a raw
   * NestJS HttpException. Handles ValidationPipe's array-of-messages format.
   */
  private extractFromHttpException(
    status: number,
    raw: string | object,
  ): { code: ErrorCode; message: string } {
    // ValidationPipe produces: { message: string[], error: 'Bad Request', statusCode: 400 }
    if (
      status === HttpStatus.BAD_REQUEST &&
      typeof raw === 'object' &&
      Array.isArray((raw as Record<string, unknown>)['message'])
    ) {
      const messages = (raw as { message: string[] }).message;
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: messages.join('; '),
      };
    }

    const message =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && 'message' in raw
          ? String((raw as Record<string, unknown>)['message'])
          : 'An error occurred';

    const code = HTTP_CODE_MAP[status] ?? ErrorCode.INTERNAL_ERROR;
    return { code, message };
  }

  private format(
    code: string,
    message: string,
    statusCode: number,
    traceId?: string,
  ): ErrorBody {
    return {
      error: {
        code,
        message,
        statusCode,
        timestamp: new Date().toISOString(),
        ...(traceId !== undefined && { traceId }),
      },
    };
  }
}
