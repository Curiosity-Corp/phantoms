import { serveStatic } from '@hono/bun';
import { createDatabase, createTaskStore } from '@phantoms/db';
import { createApp } from './app';

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

console.info(`PHANTOMS API listening on http://${host}:${server.port}`);

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    console.warn(
      `Received ${signal} while shutting down; closing active connections.`,
    );
    void server.stop(true).catch((error: unknown) => {
      console.error('Forced server shutdown failed', error);
    });
    return shutdownPromise;
  }

  console.info(`Received ${signal}; draining active requests.`);
  const forceStopTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out; closing active connections.');
    void server.stop(true).catch((error: unknown) => {
      console.error('Forced server shutdown failed', error);
    });
  }, 10_000);

  shutdownPromise = (async () => {
    try {
      await server.stop();
    } finally {
      clearTimeout(forceStopTimer);
      await client.end({ timeout: 5 });
    }
  })();

  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal).catch((error: unknown) => {
      console.error('Graceful shutdown failed', error);
    });
  });
}
