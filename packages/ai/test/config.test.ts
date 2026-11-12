import { describe, expect, test } from 'bun:test';
import { aiConfigFromEnv, createAIClient } from '../src/index';

describe('AI configuration', () => {
  test('is undefined when nothing is configured', () => {
    expect(aiConfigFromEnv({})).toBeUndefined();
    expect(
      aiConfigFromEnv({ AI_BASE_URL: '', AI_API_KEY: '', AI_MODEL: '' }),
    ).toBeUndefined();
  });

  test('reads the three server-side variables', () => {
    expect(
      aiConfigFromEnv({
        AI_BASE_URL: 'http://127.0.0.1:11434/v1',
        AI_MODEL: 'local-model',
        AI_API_KEY: ' k ',
      }),
    ).toEqual({
      baseURL: 'http://127.0.0.1:11434/v1',
      model: 'local-model',
      apiKey: 'k',
    });
  });

  test('names what is missing when half configured, without echoing values', () => {
    expect(() =>
      aiConfigFromEnv({ AI_BASE_URL: 'http://127.0.0.1:1/v1' }),
    ).toThrow('AI_MODEL');
    expect(() =>
      aiConfigFromEnv({ AI_MODEL: 'm', AI_API_KEY: 'sekret' }),
    ).toThrow(/AI_BASE_URL(?!.*sekret)/);
  });

  test('the client built from config declares capabilities explicitly', () => {
    const client = createAIClient({
      baseURL: 'http://127.0.0.1:9999/v1',
      model: 'm',
      capabilities: { toolCalling: false },
    });

    expect(client.capabilities).toEqual({
      streaming: true,
      structuredOutput: true,
      toolCalling: false,
    });
    expect(client.name).toBe('openai-compatible');
  });
});
