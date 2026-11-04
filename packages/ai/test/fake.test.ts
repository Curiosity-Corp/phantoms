import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { AIError, createFakeAI, defineTool } from '../src/index';
import { collectUsage } from './helpers';

const ran: string[] = [];
const tools = {
  lookup: defineTool({
    description: 'Look up a record.',
    inputSchema: z.object({ id: z.string() }),
    execute: ({ id }) => {
      ran.push(id);
      return { id };
    },
  }),
};

describe('fake adapter', () => {
  test('is deterministic and records calls', async () => {
    const fake = createFakeAI({ text: (prompt) => `echo:${prompt}` });

    expect(await fake.generate('a')).toBe('echo:a');
    expect(await fake.generate('a')).toBe('echo:a');
    expect(fake.calls.map((call) => call.prompt)).toEqual(['a', 'a']);
  });

  test('streams the configured text in chunks', async () => {
    const fake = createFakeAI({ text: 'abcdefghij', chunkSize: 4 });
    const parts: string[] = [];
    for await (const part of fake.stream('go')) parts.push(part);

    expect(parts).toEqual(['abcd', 'efgh', 'ij']);
  });

  test('validates objects like the real adapter', async () => {
    const schema = z.object({ ok: z.boolean() });

    expect(
      await createFakeAI({ object: { ok: true } }).generateObject(schema, 'x'),
    ).toEqual({ ok: true });
    await expect(
      createFakeAI({ object: { ok: 'yes' } }).generateObject(schema, 'x'),
    ).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  test('runs scripted tool calls only for enabled tools', async () => {
    ran.length = 0;
    const fake = createFakeAI({
      tools,
      toolCalls: [{ name: 'lookup', input: { id: 'z9' } }],
      text: 'done',
    });

    expect(await fake.generate('x', { tools: ['lookup'] })).toBe('done');
    expect(ran).toEqual(['z9']);

    ran.length = 0;
    await fake.generate('x');
    expect(ran).toEqual([]);
  });

  test('rejects unknown tools, bad tool input and runaway loops', async () => {
    const fake = createFakeAI({
      tools,
      toolCalls: [{ name: 'lookup', input: { id: 5 } }],
    });
    await expect(
      fake.generate('x', { tools: ['shell'] }),
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(
      fake.generate('x', { tools: ['lookup'] }),
    ).rejects.toMatchObject({ kind: 'invalid_output' });

    const loop = createFakeAI({
      tools,
      toolCalls: Array.from({ length: 3 }, () => ({
        name: 'lookup',
        input: { id: 'a' },
      })),
    });
    await expect(
      loop.generate('x', { tools: ['lookup'], budget: { maxSteps: 3 } }),
    ).rejects.toMatchObject({ kind: 'budget_exceeded' });
  });

  test('applies prompt limits and declared capabilities', async () => {
    const fake = createFakeAI({
      capabilities: { streaming: false },
      limits: { maxPromptChars: 5 },
    });

    await expect(fake.generate('123456')).rejects.toThrow('Prompt length');
    expect(() => fake.stream('hi')).toThrow(AIError);
  });

  test('can simulate a provider failure', async () => {
    const fake = createFakeAI({ failWith: 'timeout' });

    await expect(fake.generate('x')).rejects.toMatchObject({ kind: 'timeout' });
  });

  test('emits usage records without prompt text', async () => {
    const log = collectUsage();
    const fake = createFakeAI({ onUsage: log.sink, text: 'reply text' });

    await fake.generate('private prompt');

    expect(log.records[0]).toMatchObject({ adapter: 'fake', outcome: 'ok' });
    expect(JSON.stringify(log.records)).not.toContain('private');
  });
});
