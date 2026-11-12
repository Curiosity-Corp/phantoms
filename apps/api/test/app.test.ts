import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { captureLogger, makeStore } from './helpers';

describe('Hono API', () => {
  test('reports liveness without touching dependencies', async () => {
    const app = createApp({
      tasks: makeStore(),
      webOrigin: 'http://localhost:3000',
      logger: captureLogger().logger,
    });
    const response = await app.request('/healthz');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('validates and stores a task', async () => {
    const app = createApp({
      tasks: makeStore(),
      webOrigin: 'http://localhost:3000',
      logger: captureLogger().logger,
    });
    const response = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Learn PHANTOMS' }),
    });

    expect(response.status).toBe(201);
    expect((await response.json()).item.title).toBe('Learn PHANTOMS');
  });

  test('rejects an invalid task payload', async () => {
    const app = createApp({
      tasks: makeStore(),
      webOrigin: 'http://localhost:3000',
      logger: captureLogger().logger,
    });
    const response = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });

    expect(response.status).toBe(400);
  });

  test('requires a bearer token on API routes when configured', async () => {
    const app = createApp({
      apiToken: 'local-test-token',
      tasks: makeStore(),
      webOrigin: 'http://localhost:3000',
      logger: captureLogger().logger,
    });
    const blocked = await app.request('/api/tasks');
    const allowed = await app.request('/api/tasks', {
      headers: { Authorization: 'Bearer local-test-token' },
    });

    expect(blocked.status).toBe(401);
    expect(allowed.status).toBe(200);
  });
});
