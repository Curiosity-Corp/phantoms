import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { bearerToken, tokenMatches } from './auth';
import { createTaskServer, type TaskReader } from './tools';

export type McpAppOptions = {
  // Shared secret every caller must present as `Authorization: Bearer ...`.
  token: string;
  tasks: TaskReader;
  // Browsers send an Origin header; agent harnesses normally do not. Any
  // request that carries an Origin not listed here is refused.
  allowedOrigins?: string[];
};

export const MIN_TOKEN_LENGTH = 32;

export function createMcpApp({
  token,
  tasks,
  allowedOrigins = [],
}: McpAppOptions) {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `The MCP bearer token must be at least ${MIN_TOKEN_LENGTH} characters.`,
    );
  }

  const app = new Hono();
  app.use('*', secureHeaders());

  app.use('/mcp', async (context, next) => {
    const origin = context.req.header('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      return context.json({ error: 'Origin not allowed.' }, 403);
    }

    const presented = bearerToken(context.req.header('authorization'));
    if (!presented || !tokenMatches(presented, token)) {
      return context.json({ error: 'Unauthorized.' }, 401, {
        'WWW-Authenticate': 'Bearer',
      });
    }
    await next();
  });
  app.use('/mcp', bodyLimit({ maxSize: 32 * 1024 }));

  app.all('/mcp', async (context) => {
    const server = createTaskServer(tasks);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(context.req.raw);
    } finally {
      await server.close();
    }
  });

  app.onError((error, context) => {
    console.error('MCP request failed', {
      name: error.name,
      path: context.req.path,
    });
    return context.json({ error: 'The request could not be completed.' }, 500);
  });

  return app;
}
