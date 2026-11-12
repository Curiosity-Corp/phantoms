import { trace } from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono';
import type { Logger } from './logger';

export type AppEnv = {
  Variables: {
    requestId: string;
    logger: Logger;
  };
};

export const REQUEST_ID_HEADER = 'X-Request-Id';

// An inbound ID is only trusted when it is short and made of safe characters,
// so a caller cannot forge log lines or response headers through it.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

const PROBE_PATHS = new Set(['/healthz', '/readyz']);

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const incoming = context.req.header(REQUEST_ID_HEADER);
    const id =
      incoming && SAFE_REQUEST_ID.test(incoming)
        ? incoming
        : crypto.randomUUID();
    context.set('requestId', id);
    context.header(REQUEST_ID_HEADER, id);
    trace.getActiveSpan()?.setAttribute('http.request.id', id);
    await next();
  };
}

/**
 * Logs one line per request after it finishes: method, path (never the query
 * string, which can carry tokens), status, duration, request ID and, when a
 * trace is active, its IDs. Headers and bodies are never logged.
 */
export function accessLog(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const requestLogger = logger.child({ requestId: context.get('requestId') });
    context.set('logger', requestLogger);
    const started = performance.now();
    await next();
    const status = context.res.status;
    const spanContext = trace.getActiveSpan()?.spanContext();
    const level =
      status >= 500
        ? 'error'
        : status >= 400
          ? 'warn'
          : PROBE_PATHS.has(context.req.path)
            ? 'debug'
            : 'info';
    requestLogger[level]('request', {
      method: context.req.method,
      path: context.req.path,
      status,
      durationMs: Math.round(performance.now() - started),
      ...(spanContext
        ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
        : {}),
    });
  };
}
