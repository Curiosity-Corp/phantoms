// Follows the "local OpenAI-compatible server" steps in docs/ai.md against a
// stub bound to the loopback interface. No model runs and nothing leaves this
// machine; the stub only proves the adapter speaks the documented protocol.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { aiConfigFromEnv, createAIClient, defineTool } from '../src/index';
import { collectUsage } from './helpers';

type RequestBody = {
  model?: string;
  stream?: boolean;
  messages: { role: string }[];
  tools?: { function?: { name?: string } }[];
  response_format?: { type?: string };
};
type Seen = { path: string; auth: string | null; body: RequestBody };
const seen: Seen[] = [];
let server: ReturnType<typeof Bun.serve>;

const chunk = (delta: object, finish: string | null = null) =>
  `data: ${JSON.stringify({
    id: 'c1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'local-model',
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body = (await request.json()) as RequestBody;
      seen.push({
        path: url.pathname,
        auth: request.headers.get('authorization'),
        body,
      });
      if (body.stream) {
        const text =
          chunk({ role: 'assistant', content: 'Hel' }) +
          chunk({ content: 'lo' }) +
          chunk({}, 'stop') +
          'data: [DONE]\n\n';
        return new Response(text, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      const wantsTool =
        Array.isArray(body.tools) &&
        body.messages.every((m) => m.role !== 'tool');
      const message = wantsTool
        ? {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{"id":"a1"}' },
              },
            ],
          }
        : {
            role: 'assistant',
            content: body.response_format ? '{"label":"ok"}' : 'local answer',
          };
      return Response.json({
        id: 'r1',
        object: 'chat.completion',
        created: 1,
        model: 'local-model',
        choices: [
          {
            index: 0,
            message,
            finish_reason: wantsTool ? 'tool_calls' : 'stop',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      });
    },
  });
});

afterAll(() => server.stop(true));

const quiet = { onUsage: () => {} };
const baseURL = () => `http://127.0.0.1:${server.port}/v1`;

describe('pointing the adapter at a local OpenAI-compatible server', () => {
  test('generate, using the three environment variables', async () => {
    seen.length = 0;
    const config = aiConfigFromEnv({
      AI_BASE_URL: baseURL(),
      AI_MODEL: 'local-model',
    });
    const log = collectUsage();
    const client = createAIClient(config as NonNullable<typeof config>, {
      onUsage: log.sink,
    });

    expect(await client.generate('hello')).toBe('local answer');

    expect(seen[0]?.path).toBe('/v1/chat/completions');
    expect(seen[0]?.auth).toBeNull();
    expect(seen[0]?.body.model).toBe('local-model');
    expect(log.records[0]).toMatchObject({
      outcome: 'ok',
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  test('sends the API key only when one is configured', async () => {
    seen.length = 0;
    const client = createAIClient(
      {
        baseURL: baseURL(),
        model: 'local-model',
        apiKey: 'test-key',
      },
      quiet,
    );
    await client.generate('hello');

    expect(seen[0]?.auth).toBe('Bearer test-key');
  });

  test('stream', async () => {
    const client = createAIClient(
      { baseURL: baseURL(), model: 'local-model' },
      quiet,
    );
    const parts: string[] = [];
    for await (const part of client.stream('hello')) parts.push(part);

    expect(parts.join('')).toBe('Hello');
  });

  test('structured output is requested and validated', async () => {
    seen.length = 0;
    const client = createAIClient(
      { baseURL: baseURL(), model: 'local-model' },
      quiet,
    );

    const value = await client.generateObject(
      z.object({ label: z.string() }),
      'classify',
    );

    expect(value).toEqual({ label: 'ok' });
    expect(seen[0]?.body.response_format?.type).toBe('json_schema');
  });

  test('tool calling runs the allowlisted tool', async () => {
    seen.length = 0;
    const looked: string[] = [];
    const client = createAIClient(
      { baseURL: baseURL(), model: 'local-model' },
      {
        ...quiet,
        tools: {
          lookup: defineTool({
            description: 'Look up a record.',
            inputSchema: z.object({ id: z.string() }),
            execute: ({ id }) => {
              looked.push(id);
              return { id };
            },
          }),
        },
      },
    );

    const text = await client.generate('find a1', { tools: ['lookup'] });

    expect(looked).toEqual(['a1']);
    expect(text).toBe('local answer');
    expect(seen[0]?.body.tools?.[0]?.function?.name).toBe('lookup');
  });
});
