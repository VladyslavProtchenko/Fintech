import { Injectable, LoggerService, Inject } from '@nestjs/common';
import * as winston from 'winston';
import { TraceContext } from './trace.context';
import { LOGGER_OPTIONS } from './logger.constants';
import { LoggerModuleOptions } from './logger.interfaces';

// Keys whose values are redacted before logging
const SENSITIVE_KEYS = [
  'password', 'passwd', 'secret', 'token', 'apikey', 'api_key',
  'authorization', 'auth', 'credential', 'private', 'key',
];

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s));
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitive(k)) {
      result[k] = '[REDACTED]';
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = redact(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// Parse variadic params passed by NestJS or by services directly.
// NestJS passes: log(msg, context?) | error(msg, stack?, context?)
// Services pass: log(msg, meta?) | log(msg, context, meta?)
function parseParams(params: unknown[]): {
  context?: string;
  meta?: Record<string, unknown>;
} {
  let context: string | undefined;
  let meta: Record<string, unknown> | undefined;

  for (const p of params) {
    if (typeof p === 'string') {
      context = p;
    } else if (p !== null && typeof p === 'object' && !Array.isArray(p)) {
      meta = p as Record<string, unknown>;
    }
  }

  return { context, meta };
}

function parseErrorParams(params: unknown[]): {
  context?: string;
  stack?: string;
  meta?: Record<string, unknown>;
} {
  let context: string | undefined;
  let stack: string | undefined;
  let meta: Record<string, unknown> | undefined;

  for (const p of params) {
    if (p instanceof Error) {
      stack = p.stack;
    } else if (typeof p === 'string') {
      // NestJS passes stack trace as first string param in error()
      if (!stack && (p.includes('\n') || p.startsWith('Error'))) {
        stack = p;
      } else {
        context = p;
      }
    } else if (p !== null && typeof p === 'object' && !Array.isArray(p)) {
      meta = p as Record<string, unknown>;
    }
  }

  return { context, stack, meta };
}

@Injectable()
export class AppLogger implements LoggerService {
  private readonly winston: winston.Logger;

  constructor(
    @Inject(LOGGER_OPTIONS) private readonly options: LoggerModuleOptions,
  ) {
    const isDev = process.env['NODE_ENV'] !== 'production';

    this.winston = winston.createLogger({
      level: process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info'),
      format: isDev ? this.devFormat() : this.prodFormat(),
      transports: [new winston.transports.Console()],
    });
  }

  private prodFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    );
  }

  private devFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf((info) => {
        const { timestamp, level, message, context, traceId, stack, ...meta } =
          info as Record<string, unknown>;
        const ctx = context ? `[${String(context)}] ` : '';
        const trace = traceId
          ? `(${String(traceId).slice(0, 8)}) `
          : '';
        const metaStr =
          Object.keys(meta).length > 0
            ? ` ${JSON.stringify(meta)}`
            : '';
        const stackStr = stack ? `\n${String(stack)}` : '';
        return `${String(timestamp)} ${String(level)} ${ctx}${trace}${String(message)}${metaStr}${stackStr}`;
      }),
    );
  }

  private buildMeta(
    context?: string,
    meta?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      service: this.options.serviceName,
      traceId: TraceContext.getTraceId(),
      ...(context ? { context } : {}),
      ...(meta ? redact(meta) : {}),
    };
  }

  log(message: unknown, ...params: unknown[]): void {
    const { context, meta } = parseParams(params);
    this.winston.info(String(message), this.buildMeta(context, meta));
  }

  error(message: unknown, ...params: unknown[]): void {
    const { context, stack, meta } = parseErrorParams(params);
    this.winston.error(String(message), {
      ...this.buildMeta(context, meta),
      ...(stack ? { stack } : {}),
    });
  }

  warn(message: unknown, ...params: unknown[]): void {
    const { context, meta } = parseParams(params);
    this.winston.warn(String(message), this.buildMeta(context, meta));
  }

  debug(message: unknown, ...params: unknown[]): void {
    const { context, meta } = parseParams(params);
    this.winston.debug(String(message), this.buildMeta(context, meta));
  }

  verbose(message: unknown, ...params: unknown[]): void {
    const { context, meta } = parseParams(params);
    this.winston.verbose(String(message), this.buildMeta(context, meta));
  }
}
