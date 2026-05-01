import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      const errors = this.extractErrors(response);

      res.status(status).json({ ok: false, errors });
      return;
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      errors: [{ field: '_', reason: 'Internal server error' }],
    });
  }

  private extractErrors(
    response: string | object,
  ): Array<{ field: string; reason: string }> {
    if (typeof response === 'string') {
      return [{ field: '_', reason: response }];
    }

    const body = response as { message?: string | string[] };
    const messages = Array.isArray(body.message) ? body.message : [body.message ?? 'Something went wrong'];

    return messages.map(msg => {
      const match = typeof msg === 'string' ? msg.match(/^(\w+)\s+(.+)$/) : null;
      if (match) return { field: match[1], reason: match[2] };
      return { field: '_', reason: String(msg) };
    });
  }
}
