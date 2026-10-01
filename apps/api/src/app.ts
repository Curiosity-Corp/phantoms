import type { Task } from '@phantoms/db';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';

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
};

const createTaskInput = z.object({
  title: z.string().trim().min(1).max(200),
});

export function createApp({ apiToken, tasks, webOrigin }: AppOptions) {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use(
    '/api/*',
    cors({
      origin: webOrigin,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
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

    console.error('API request failed', {
      name: error.name,
      path: context.req.path,
    });
    return context.json({ error: 'The request could not be completed.' }, 500);
  });

  return app;
}
