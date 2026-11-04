// Exercises the real AI SDK MCP client over HTTP against a stub bound to the
// loopback interface. The stub speaks just enough JSON-RPC to initialise, list
// two tools and call one; nothing leaves this machine.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectMCPTools, createFakeAI } from '../src/index';

type Rpc = { id?: number; method: string; params?: Record<string, unknown> };
const methods: string[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const rpc = (await request.json()) as Rpc;
      methods.push(rpc.method);
      const reply = (result: unknown) =>
        Response.json({ jsonrpc: '2.0', id: rpc.id, result });
      switch (rpc.method) {
        case 'initialize':
          return reply({
            protocolVersion: rpc.params?.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'stub', version: '1.0.0' },
          });
        case 'tools/list':
          return reply({
            tools: ['search', 'delete_everything'].map((name) => ({
              name,
              description: `${name} tool`,
              inputSchema: { type: 'object', properties: {} },
            })),
          });
        case 'tools/call':
          return reply({ content: [{ type: 'text', text: 'found it' }] });
        default:
          if (rpc.method.startsWith('notifications/')) {
            return new Response(null, { status: 202 });
          }
          return Response.json({
            jsonrpc: '2.0',
            id: rpc.id,
            error: { code: -32601, message: 'Method not found' },
          });
      }
    },
  });
});

afterAll(() => server.stop(true));

test('connects with the real client and exposes only allowlisted tools', async () => {
  const mcp = await connectMCPTools({
    enabled: true,
    servers: [
      {
        name: 'docs',
        url: `http://127.0.0.1:${server.port}/mcp`,
        allowedTools: ['search'],
      },
    ],
  });
  try {
    expect(Object.keys(mcp.tools)).toEqual(['docs_search']);
    expect(methods).toContain('tools/list');

    // The exposed tool plugs into an adapter's allowlist like any other tool.
    const ai = createFakeAI({
      tools: mcp.tools,
      toolCalls: [{ name: 'docs_search', input: {} }],
      text: 'done',
    });
    expect(await ai.generate('find', { tools: ['docs_search'] })).toBe('done');
    expect(methods).toContain('tools/call');
  } finally {
    await mcp.close();
  }
});
