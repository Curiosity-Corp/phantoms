import { describe, expect, test } from 'bun:test';
import { createAIClient } from '../src/index';

describe('PHANTOMS AI adapter', () => {
  test('requires an HTTP model endpoint', () => {
    expect(() =>
      createAIClient({
        baseURL: 'file:///private/config',
        model: 'local-model',
      }),
    ).toThrow();
  });

  test('rejects an empty prompt before sending a provider request', async () => {
    const client = createAIClient({
      baseURL: 'http://127.0.0.1:9999/v1',
      model: 'test-model',
    });

    await expect(client.generate('')).rejects.toThrow('Prompt length');
  });
});
