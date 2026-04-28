import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { TraceContext } from './trace.context';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Reuse trace ID from upstream service if provided (distributed tracing)
    const traceId =
      (req.headers['x-trace-id'] as string | undefined) ?? randomUUID();

    // Pass trace ID downstream to any service we call
    res.setHeader('x-trace-id', traceId);

    TraceContext.run(traceId, () => next());
  }
}
