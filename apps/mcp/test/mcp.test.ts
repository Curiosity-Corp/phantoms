import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpApp } from '../src/app';
import { bearerToken, tokenMatches } from '../src/auth';
import type { TaskView } from '../src/tools';

// Generated per run; never a real credential.
const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;

const items: TaskView[] = [
  {
    id: '3f6c1f0e-8f0b-4b53-9d0f-0a8d4a2d1c11',
    title: 'Write the architecture note',
    createdAt: new Date('2026-11-02T09:00:00.000Z'),
  },
  {
    id: '7b1c2d3e-4f50-4a61-8b72-9c83d4e5f6a7',
    title: 'Review the security page',
    createdAt: new Date('2026-11-01T09:00:00.000Z'),
  },
];

let server: ReturnType<typeof Bun.serve>;
let url: URL;

beforeAll(() => {
  const app = createMcpApp({ token, tasks: { list: async () => items } });
  server = Bun.serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  url = new URL(`http://127.0.0.1:${server.port}/mcp`);
});

afterAll(async () => {
  await server.stop(true);
});

function connect(headers: Record<string, string>) {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
  return { client, connected: client.connect(transport) };
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] })
    .content;
  return content.map((part) => part.text).join('');
}

describe('MCP task server over streamable HTTP', () => {
  test('lists exactly two tools, both marked read-only', async () => {
    const { client, connected } = connect({
      Authorization: `Bearer ${token}`,
    });
    await connected;
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_task',
      'list_tasks',
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
  });

  test('calls a tool with a valid token', async () => {
    const { client, connected } = connect({
      Authorization: `Bearer ${token}`,
    });
    await connected;

    const list = await client.callTool({
      name: 'list_tasks',
      arguments: { limit: 1 },
    });
    expect(JSON.parse(textOf(list))).toEqual({
      items: [
        {
          id: items[0]?.id,
          title: 'Write the architecture note',
          createdAt: '2026-11-02T09:00:00.000Z',
        },
      ],
    });

    const one = await client.callTool({
      name: 'get_task',
      arguments: { id: items[1]?.id },
    });
    expect(JSON.parse(textOf(one)).item.title).toBe('Review the security page');

    const missing = await client.callTool({
      name: 'get_task',
      arguments: { id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(missing.isError).toBe(true);
    await client.close();
  });

  test('rejects invalid tool input', async () => {
    const { client, connected } = connect({
      Authorization: `Bearer ${token}`,
    });
    await connected;
    // The SDK reports schema violations as a tool error, not a thrown error.
    const result = await client.callTool({
      name: 'list_tasks',
      arguments: { limit: 500 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain('Write the architecture');
    await client.close();
  });

  test('refuses a client with no token', async () => {
    const { connected } = connect({});
    await expect(connected).rejects.toThrow();
  });

  test('refuses a client with a wrong token', async () => {
    const { connected } = connect({ Authorization: 'Bearer not-the-token' });
    await expect(connected).rejects.toThrow();
  });

  test('answers 401 with a challenge before any MCP parsing', async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_tasks', arguments: {} },
    });
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    const attempts: Record<string, string>[] = [
      {},
      { Authorization: 'Bearer wrong' },
      { Authorization: `Basic ${token}` },
      { Authorization: token },
    ];

    for (const extra of attempts) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, ...extra },
        body,
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      expect(await response.text()).not.toContain('Write the architecture');
    }
  });

  test('refuses a browser Origin that is not allowed', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  test('refuses to start with a short token', () => {
    expect(() =>
      createMcpApp({ token: 'short', tasks: { list: async () => [] } }),
    ).toThrow();
  });
});

describe('auth helpers', () => {
  test('tokenMatches is exact and tolerates different lengths', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
    expect(tokenMatches('abc', 'abd')).toBe(false);
    expect(tokenMatches('abc', 'abcd')).toBe(false);
    expect(tokenMatches('', 'abc')).toBe(false);
  });

  test('bearerToken reads only the Bearer scheme', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeUndefined();
    expect(bearerToken('Bearer')).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
  });
});
