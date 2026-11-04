// The code shown in docs/ai.md, run as written (a mock model stands in for a
// provider package). If a doc example stops working, this test fails.
import { expect, test } from 'bun:test';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import {
  aiConfigFromEnv,
  createAIAdapter,
  createAIClient,
  createFakeAI,
  defineTool,
} from '../src/index';
import { textResult } from './helpers';

test('the configuration snippet', () => {
  const config = aiConfigFromEnv({});
  const ai = config ? createAIClient(config) : undefined;
  expect(ai).toBeUndefined();
});

test('the tools snippet', async () => {
  const tasks = { find: (id: string) => ({ id, done: true }) };
  const lookupTask = defineTool({
    description: 'Look up a task by id.',
    inputSchema: z.object({ id: z.string().min(1) }),
    execute: async ({ id }) => tasks.find(id),
  });
  const config = { baseURL: 'http://127.0.0.1:9/v1', model: 'm' };
  const ai = createAIClient(config, { tools: { lookupTask } });

  expect(ai.toolNames).toEqual(['lookupTask']);
});

test('the fake adapter snippet', async () => {
  const ai = createFakeAI({ text: 'Task 42 is done.', object: { done: true } });
  expect(await ai.generate('Is task 42 done?')).toBe('Task 42 is done.');
  expect(ai.calls).toHaveLength(1);
});

test('the first-party provider snippet', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => textResult('ok'),
  });
  const createProvider = (_settings: { apiKey?: string }) => () => model;
  const provider = createProvider({ apiKey: process.env.AI_API_KEY });

  const ai = createAIAdapter({
    name: 'example-provider',
    modelId: 'example-model',
    model: provider(),
    capabilities: {
      streaming: true,
      structuredOutput: true,
      toolCalling: true,
    },
    limits: {
      timeoutMs: 15_000,
      maxOutputTokens: 512,
      maxSteps: 5,
      maxTotalTokens: 20_000,
    },
    onUsage: () => {},
  });

  expect(await ai.generate('hello')).toBe('ok');
});
