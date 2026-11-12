import { createDatabase, createTaskStore } from '@phantoms/db';
import { createMcpApp } from './app';

// Optional example server. It is not part of the default `bun run dev`,
// compose file or container image. Start it on purpose with:
//   bun run --filter @phantoms/mcp start
const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before starting the MCP server.');
}
const token = Bun.env.MCP_BEARER_TOKEN;
if (!token) {
  throw new Error(
    'MCP_BEARER_TOKEN must be set before starting the MCP server.',
  );
}

const host = Bun.env.MCP_HOST ?? '127.0.0.1';
const port = Number(Bun.env.MCP_PORT ?? '4100');
const allowedOrigins = (Bun.env.MCP_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const { client, db } = createDatabase(databaseUrl);
const store = createTaskStore(db);
const app = createMcpApp({
  token,
  tasks: { list: () => store.list() },
  allowedOrigins,
});

const server = Bun.serve({ fetch: app.fetch, hostname: host, port });
console.info(
  `PHANTOMS MCP example listening on http://${host}:${server.port}/mcp`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      await server.stop();
      await client.end({ timeout: 5 });
    })();
  });
}
