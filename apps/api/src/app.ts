import { httpInstrumentationMiddleware } from '@hono/otel';
import type { TracerProvider } from '@opentelemetry/api';
import type { Task } from '@phantoms/db';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { createLogger, type Logger } from './logger';
import {
  type AppEnv,
  accessLog,
  REQUEST_ID_HEADER,
  requestId,
} from './middleware';

export type TaskStore = {
  list: () => Promise<Task[]>;
  create: (title: string) => Promise<Task>;
  remove: (id: string) => Promise<void>;
  check: () => Promise<void>;
};

type AppOptions = {
  apiToken?: string;
  tasks: TaskStore;
  webOrigin: string;
  /** Defaults to JSON lines on stdout. */
  logger?: Logger;
  /** Adds an OpenTelemetry span per request when set; see telemetry.ts. */
  tracerProvider?: TracerProvider;
};

const createTaskInput = z.object({
  title: z.string().trim().min(1).max(200),
});

export function createApp({
  apiToken,
  tasks,
  webOrigin,
  logger = createLogger(),
  tracerProvider,
}: AppOptions) {
  const app = new Hono<AppEnv>();

  // Tracing wraps everything else so the request ID and the log line can
  // carry the active trace.
  if (tracerProvider) {
    app.use('*', httpInstrumentationMiddleware({ tracerProvider }));
  }
  app.use('*', requestId());
  app.use('*', accessLog(logger));
  app.use('*', secureHeaders());
  app.use(
    '/api/*',
    cors({
      origin: webOrigin,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER],
      exposeHeaders: [REQUEST_ID_HEADER],
      maxAge: 600,
    }),
  );
  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024 }));
  if (apiToken) {
    app.use('/api/*', bearerAuth({ token: apiToken }));
  }

  app.get('/healthz', (context) => context.json({ status: 'ok' }));

  app.get('/readyz', async (context) => {
    try {
      await tasks.check();
      return context.json({ status: 'ready' });
    } catch {
      return context.json({ status: 'not_ready' }, 503);
    }
  });

  app.get('/api/tasks', async (context) => {
    const items = await tasks.list();
    return context.json({ items });
  });

  app.post('/api/tasks', async (context) => {
    let input: unknown;

    try {
      input = await context.req.json();
    } catch {
      return context.json({ error: 'Request body must be valid JSON.' }, 400);
    }

    const parsed = createTaskInput.safeParse(input);
    if (!parsed.success) {
      return context.json(
        { error: 'A title of 1 to 200 characters is required.' },
        400,
      );
    }

    const item = await tasks.create(parsed.data.title);
    return context.json({ item }, 201);
  });

  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }

    // Only the error class is logged: messages can carry connection strings.
    logger.error('request failed', {
      requestId: context.get('requestId'),
      name: error.name,
      path: context.req.path,
    });
    return context.json(
      {
        error: 'The request could not be completed.',
        requestId: context.get('requestId'),
      },
      500,
    );
  });

  return app;
}
