import { describe, expect, test } from 'bun:test';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import {
  type AIAdapter,
  AIError,
  createAIAdapter,
  defineTool,
} from '../src/index';
import {
  collectUsage,
  streamModel,
  textResult,
  toolCallResult,
} from './helpers';

const limits = {
  timeoutMs: 2_000,
  maxOutputTokens: 256,
  maxSteps: 3,
  maxTotalTokens: 1_000,
  maxRetries: 0,
};
const capabilities = {
  streaming: true,
  structuredOutput: true,
  toolCalling: true,
};

function adapterFor(
  model: MockLanguageModelV4,
  extra: Partial<Parameters<typeof createAIAdapter>[0]> = {},
) {
  const log = collectUsage();
  const adapter = createAIAdapter({
    name: 'test',
    modelId: 'mock-model',
    model,
    capabilities,
    limits,
    onUsage: log.sink,
    ...extra,
  });
  return { adapter, records: log.records };
}

async function rejection(promise: Promise<unknown>): Promise<AIError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AIError) return error;
    throw error;
  }
  throw new Error('expected the request to be rejected');
}

describe('generate', () => {
  test('returns the text and logs usage without prompt or response text', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('The secret answer is 42.', 11, 6),
    });
    const { adapter, records } = adapterFor(model);

    const text = await adapter.generate('my private question about salaries');

    expect(text).toBe('The secret answer is 42.');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      adapter: 'test',
      model: 'mock-model',
      operation: 'generate',
      outcome: 'ok',
      inputTokens: 11,
      outputTokens: 6,
      steps: 1,
      toolCalls: 0,
    });
    const logged = JSON.stringify(records);
    expect(logged).not.toContain('salaries');
    expect(logged).not.toContain('secret answer');
  });

  test('rejects an empty or oversized prompt before any model call', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('x'),
    });
    const { adapter } = adapterFor(model);

    expect((await rejection(adapter.generate(''))).message).toContain(
      'Prompt length',
    );
    expect((await rejection(adapter.generate('a'.repeat(8_001)))).kind).toBe(
      'invalid_request',
    );
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test('passes the budget to the model call and clamps request values to the ceiling', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('ok'),
    });
    const { adapter } = adapterFor(model);

    await adapter.generate('hi', { budget: { maxOutputTokens: 64 } });
    await adapter.generate('hi', { budget: { maxOutputTokens: 99_999 } });

    expect(model.doGenerateCalls[0]?.maxOutputTokens).toBe(64);
    expect(model.doGenerateCalls[1]?.maxOutputTokens).toBe(256);
  });

  test('wraps provider failures without leaking the underlying message', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('upstream said: prompt was "my private question"');
      },
    });
    const { adapter, records } = adapterFor(model);

    const error = await rejection(adapter.generate('my private question'));

    expect(error.kind).toBe('provider_error');
    expect(error.message).not.toContain('private');
    expect(records[0]?.outcome).toBe('provider_error');
  });

  test('times out slow models', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener('abort', () =>
            reject(abortSignal.reason),
          );
        }),
    });
    const { adapter, records } = adapterFor(model);

    const error = await rejection(
      adapter.generate('hi', { budget: { timeoutMs: 30 } }),
    );

    expect(error.kind).toBe('timeout');
    expect(records[0]?.outcome).toBe('timeout');
  });

  test('stops when the caller cancels', async () => {
    let started: () => void = () => {};
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          started();
          abortSignal?.addEventListener('abort', () =>
            reject(abortSignal.reason),
          );
        }),
    });
    const { adapter } = adapterFor(model);
    const controller = new AbortController();
    const pending = rejection(
      adapter.generate('hi', { signal: controller.signal }),
    );
    await running;
    controller.abort();

    expect((await pending).kind).toBe('aborted');
  });

  test('a failing usage sink never breaks the request', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('fine'),
    });
    const { adapter } = adapterFor(model, {
      onUsage: () => {
        throw new Error('log pipeline down');
      },
    });

    expect(await adapter.generate('hi')).toBe('fine');
  });
});

describe('generateObject', () => {
  const schema = z.object({ label: z.enum(['spam', 'ok']), score: z.number() });

  test('returns validated, typed data', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('{"label":"ok","score":0.9}'),
    });
    const { adapter, records } = adapterFor(model);

    const value = await adapter.generateObject(schema, 'classify this');

    expect(value).toEqual({ label: 'ok', score: 0.9 });
    expect(records[0]?.operation).toBe('generateObject');
  });

  test('rejects output that does not match the schema', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('{"label":"maybe","score":"high"}'),
    });
    const { adapter, records } = adapterFor(model);

    const error = await rejection(adapter.generateObject(schema, 'classify'));

    expect(error.kind).toBe('invalid_output');
    expect(error.message).not.toContain('maybe');
    expect(records[0]?.outcome).toBe('invalid_output');
  });

  test('rejects output that is not JSON', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('I am sorry, I cannot do that.'),
    });
    const { adapter } = adapterFor(model);

    expect((await rejection(adapter.generateObject(schema, 'x'))).kind).toBe(
      'invalid_output',
    );
  });

  test('refuses when structured output is not declared', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('{}'),
    });
    const { adapter } = adapterFor(model, {
      capabilities: { ...capabilities, structuredOutput: false },
    });

    expect((await rejection(adapter.generateObject(schema, 'x'))).kind).toBe(
      'unsupported',
    );
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe('tools', () => {
  const lookups: string[] = [];
  const tools = {
    lookup: defineTool({
      description: 'Look up a record by id.',
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: ({ id }) => {
        lookups.push(id);
        return { id, status: 'open' };
      },
    }),
    wipe: defineTool({
      description: 'A dangerous tool the request does not enable.',
      inputSchema: z.object({}),
      execute: () => {
        lookups.push('WIPED');
        return 'done';
      },
    }),
  };

  test('runs an enabled tool and then answers', async () => {
    lookups.length = 0;
    const model = new MockLanguageModelV4({
      doGenerate: [
        toolCallResult('lookup', { id: 'a1' }),
        textResult('Record a1 is open.'),
      ],
    });
    const { adapter, records } = adapterFor(model, { tools });

    const text = await adapter.generate('status of a1?', { tools: ['lookup'] });

    expect(text).toBe('Record a1 is open.');
    expect(lookups).toEqual(['a1']);
    expect(records[0]).toMatchObject({ steps: 2, toolCalls: 1, outcome: 'ok' });
  });

  test('exposes only the tools the request names', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('ok'),
    });
    const { adapter } = adapterFor(model, { tools });

    await adapter.generate('hi', { tools: ['lookup'] });
    await adapter.generate('hi');

    const offered = (call: number) =>
      (model.doGenerateCalls[call]?.tools ?? []).map((tool) => tool.name);
    expect(offered(0)).toEqual(['lookup']);
    expect(offered(1)).toEqual([]);
    expect(adapter.toolNames).toEqual(['lookup', 'wipe']);
  });

  test('rejects a tool that is not registered', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('ok'),
    });
    const { adapter } = adapterFor(model, { tools });

    const error = await rejection(adapter.generate('hi', { tools: ['shell'] }));

    expect(error.kind).toBe('invalid_request');
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test('a model asking for a tool it was not offered does not run it', async () => {
    lookups.length = 0;
    const model = new MockLanguageModelV4({
      doGenerate: [
        toolCallResult('wipe', {}),
        textResult('I could not do that.'),
      ],
    });
    const { adapter } = adapterFor(model, { tools });

    await adapter.generate('wipe it', { tools: ['lookup'] }).catch(() => {});

    expect(lookups).not.toContain('WIPED');
  });

  test('invalid tool arguments from the model never reach execute', async () => {
    lookups.length = 0;
    const model = new MockLanguageModelV4({
      doGenerate: [toolCallResult('lookup', { id: 123 }), textResult('Sorry.')],
    });
    const { adapter } = adapterFor(model, { tools });

    await adapter.generate('x', { tools: ['lookup'] }).catch(() => {});

    expect(lookups).toEqual([]);
  });

  test('stops a runaway tool loop at the step budget', async () => {
    lookups.length = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => toolCallResult('lookup', { id: 'again' }),
    });
    const { adapter, records } = adapterFor(model, { tools });

    const error = await rejection(
      adapter.generate('loop', { tools: ['lookup'], budget: { maxSteps: 2 } }),
    );

    expect(error.kind).toBe('budget_exceeded');
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(records[0]).toMatchObject({
      outcome: 'budget_exceeded',
      steps: 2,
      toolCalls: 2,
    });
  });

  test('stops a tool loop at the token budget', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => toolCallResult('lookup', { id: 'x' }),
    });
    const { adapter } = adapterFor(model, { tools });

    const error = await rejection(
      adapter.generate('loop', {
        tools: ['lookup'],
        budget: { maxTotalTokens: 20, maxSteps: 3 },
      }),
    );

    expect(error.kind).toBe('budget_exceeded');
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  test('refuses tools when tool calling is not declared', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult('ok'),
    });
    const { adapter } = adapterFor(model, {
      tools,
      capabilities: { ...capabilities, toolCalling: false },
    });

    const error = await rejection(
      adapter.generate('hi', { tools: ['lookup'] }),
    );

    expect(error.kind).toBe('unsupported');
  });
});

describe('stream', () => {
  async function collect(source: AsyncIterable<string>) {
    const parts: string[] = [];
    for await (const part of source) parts.push(part);
    return parts;
  }

  test('yields text as it arrives and logs usage once', async () => {
    const { adapter, records } = adapterFor(
      streamModel(['Hel', 'lo ', 'there']),
    );

    const parts = await collect(adapter.stream('hi'));

    expect(parts.join('')).toBe('Hello there');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      operation: 'stream',
      outcome: 'ok',
      inputTokens: 3,
      outputTokens: 7,
    });
  });

  test('surfaces provider errors as AIError', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('boom with private text');
      },
    });
    const { adapter, records } = adapterFor(model);

    let caught: unknown;
    try {
      await collect(adapter.stream('hi'));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AIError);
    expect((caught as AIError).message).not.toContain('private');
    expect(records[0]?.outcome).toBe('provider_error');
  });

  test('records an early stop by the consumer', async () => {
    const { adapter, records } = adapterFor(streamModel(['a', 'b', 'c']));

    for await (const _ of adapter.stream('hi')) break;

    expect(records[0]?.outcome).toBe('aborted');
  });

  test('refuses when streaming is not declared', () => {
    const { adapter } = adapterFor(streamModel(['a']), {
      capabilities: { ...capabilities, streaming: false },
    });

    expect(() => adapter.stream('hi')).toThrow(AIError);
  });
});

test('every adapter implements the same interface', () => {
  const { adapter } = adapterFor(streamModel(['a']));
  const typed: AIAdapter = adapter;
  expect(typed.capabilities).toEqual(capabilities);
  expect(Object.isFrozen(typed.capabilities)).toBe(true);
});
