// Test server for the browser journey (`bun run test:e2e`). It runs the real
// Hono app and serves the real static Next.js build, but keeps tasks in memory
// so the journey needs no PostgreSQL, network or secrets.
//   bun run build && bun run test:e2e
import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/bun';
import type { Task } from '@phantoms/db';
import { createApp, type TaskStore } from '../src/app';

const staticRoot = './apps/web/out';
if (!existsSync(`${staticRoot}/index.html`)) {
  throw new Error(
    `No static web build at ${staticRoot}. Run "bun run build" first.`,
  );
}

const port = Number(Bun.env.E2E_PORT ?? '4010');
const items: Task[] = [];
const tasks: TaskStore = {
  async list() {
    return items;
  },
  async create(title) {
    const item: Task = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date(),
    };
    items.push(item);
    return item;
  },
  async remove(id) {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items.splice(index, 1);
  },
  async check() {},
};

const app = createApp({ tasks, webOrigin: `http://127.0.0.1:${port}` });
app.use('*', serveStatic({ root: staticRoot }));

const server = Bun.serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
console.info(`e2e server listening on http://127.0.0.1:${server.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.stop(true).then(() => process.exit(0));
  });
}
