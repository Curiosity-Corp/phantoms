import { serveStatic } from '@hono/bun';
import { createDatabase, createTaskStore } from '@phantoms/db';
import { createApp } from './app';
import { createLogger, isLogLevel } from './logger';
import { createTelemetry } from './telemetry';

const logLevel = Bun.env.LOG_LEVEL?.trim().toLowerCase() || 'info';
if (!isLogLevel(logLevel)) {
  throw new Error('LOG_LEVEL must be one of debug, info, warn or error.');
}
const logger = createLogger({ level: logLevel });
// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set; see docs/recommended-tooling.md.
const telemetry = createTelemetry({ env: Bun.env });

const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before starting the API.');
}

const port = Number(Bun.env.API_PORT ?? '4000');
const host = Bun.env.API_HOST ?? '127.0.0.1';
const apiToken = Bun.env.API_BEARER_TOKEN;
if (host !== '127.0.0.1' && !apiToken) {
  throw new Error(
    'API_BEARER_TOKEN must be set when the API binds beyond loopback.',
  );
}

const { client, db } = createDatabase(databaseUrl);
const app = createApp({
  apiToken,
  tasks: createTaskStore(db),
  webOrigin: Bun.env.WEB_ORIGIN ?? 'http://localhost:3000',
  logger,
  tracerProvider: telemetry.tracerProvider,
});

if (Bun.env.SERVE_STATIC_WEB === '1') {
  app.use(
    '*',
    serveStatic({ root: Bun.env.WEB_STATIC_ROOT ?? './apps/web/out' }),
  );
}

const server = Bun.serve({
  fetch: app.fetch,
  hostname: host,
  port,
});

logger.info('listening', {
  host,
  port: server.port,
  tracing: telemetry.tracerProvider !== undefined,
});

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    logger.warn('signal received while shutting down; closing connections', {
      signal,
    });
    void server.stop(true).catch((error: unknown) => {
      logger.error('forced shutdown failed', { error });
    });
    return shutdownPromise;
  }

  logger.info('signal received; draining active requests', { signal });
  const forceStopTimer = setTimeout(() => {
    logger.error('graceful shutdown timed out; closing connections');
    void server.stop(true).catch((error: unknown) => {
      logger.error('forced shutdown failed', { error });
    });
  }, 10_000);

  shutdownPromise = (async () => {
    try {
      await server.stop();
    } finally {
      clearTimeout(forceStopTimer);
      // Flush queued spans, but never let that block closing the database.
      await telemetry.shutdown().catch((error: unknown) => {
        logger.error('telemetry flush failed', { error });
      });
      await client.end({ timeout: 5 });
    }
  })();

  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      logger.error('graceful shutdown failed', { error });
    });
  });
}
