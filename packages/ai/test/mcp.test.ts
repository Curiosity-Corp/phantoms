import { describe, expect, test } from 'bun:test';
import { tool } from 'ai';
import { z } from 'zod';
import {
  connectMCPTools,
  type MCPClientLike,
  mcpConfigFromEnv,
} from '../src/index';

const server = {
  name: 'docs',
  url: 'https://mcp.example.com/mcp',
  allowedTools: ['search'],
};

function fakeClient(offered: string[]) {
  const state = { closed: 0, listed: 0 };
  const client: MCPClientLike = {
    close: async () => {
      state.closed += 1;
    },
    listTools: (async () => {
      state.listed += 1;
      return {
        tools: offered.map((name) => ({
          name,
          description: `${name} tool`,
          inputSchema: { type: 'object' as const, properties: {} },
        })),
      };
    }) as MCPClientLike['listTools'],
    toolsFromDefinitions: ((definitions: { tools: { name: string }[] }) =>
      Object.fromEntries(
        definitions.tools.map(({ name }) => [
          name,
          tool({
            description: name,
            inputSchema: z.object({}),
            execute: async () => name,
          }),
        ]),
      )) as unknown as MCPClientLike['toolsFromDefinitions'],
  };
  return { client, state };
}

describe('MCP wiring', () => {
  test('is off by default and opens no connection', async () => {
    let connections = 0;
    const result = await connectMCPTools(
      { servers: [server] },
      {
        createClient: async () => {
          connections += 1;
          return fakeClient([]).client;
        },
      },
    );

    expect(connections).toBe(0);
    expect(result.tools).toEqual({});
    await result.close();
  });

  test('does nothing with no config at all', async () => {
    const result = await connectMCPTools(undefined);
    expect(result.tools).toEqual({});
  });

  test('exposes only allowlisted tools, namespaced by server', async () => {
    const { client, state } = fakeClient(['search', 'delete_everything']);

    const result = await connectMCPTools(
      { enabled: true, servers: [server] },
      { createClient: async () => client },
    );

    expect(Object.keys(result.tools)).toEqual(['docs_search']);
    expect(result.missing).toEqual([]);
    await result.close();
    expect(state.closed).toBe(1);
  });

  test('reports allowlisted tools the server does not offer', async () => {
    const { client } = fakeClient(['other']);

    const result = await connectMCPTools(
      { enabled: true, servers: [server] },
      { createClient: async () => client },
    );

    expect(result.tools).toEqual({});
    expect(result.missing).toEqual(['docs_search']);
  });

  test('times out a server that never answers and closes what it opened', async () => {
    const { client, state } = fakeClient(['search']);
    client.listTools = (() =>
      new Promise(() => {})) as MCPClientLike['listTools'];

    await expect(
      connectMCPTools(
        { enabled: true, connectTimeoutMs: 500, servers: [server] },
        { createClient: async () => client },
      ),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(state.closed).toBeGreaterThanOrEqual(1);
  });

  test('rejects bad configuration', async () => {
    const bad = [
      { enabled: true, servers: [{ ...server, url: 'file:///etc/passwd' }] },
      { enabled: true, servers: [{ ...server, allowedTools: [] }] },
      { enabled: true, servers: [{ ...server, name: 'Bad Name' }] },
      { enabled: true, servers: [server, server] },
    ];
    for (const config of bad) {
      await expect(connectMCPTools(config)).rejects.toThrow();
    }
  });

  test('reads server-side environment configuration', () => {
    expect(mcpConfigFromEnv({})).toEqual({ enabled: false, servers: [] });
    expect(
      mcpConfigFromEnv({
        AI_MCP_ENABLED: 'true',
        AI_MCP_SERVERS: JSON.stringify([server]),
      }),
    ).toEqual({ enabled: true, servers: [server] });
    expect(() => mcpConfigFromEnv({ AI_MCP_SERVERS: '{nope' })).toThrow(
      'JSON array',
    );
  });
});
