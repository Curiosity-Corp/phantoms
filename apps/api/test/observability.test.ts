import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { createLogger, REDACTED, redact } from '../src/logger';
import { captureLogger, makeStore } from './helpers';

const origin = 'http://localhost:3000';

// Values that must never reach a log line, in every place a request can
// carry one: header, query string, body and a stored title.
const SECRETS = {
  bearer: 'sekret-bearer-token-value-123',
  query: 'sekret-query-value-456',
  cookie: 'sekret-cookie-value-789',
  body: 'sekret-body-value-abc',
};

describe('request IDs', () => {
  test('generates one when the caller sends none', async () => {
    const app = createApp({
      tasks: makeStore(),
      webOrigin: origin,
      logger: captureLogger().logger,
    });
    const response = await app.request('/healthz');

    expect(response.headers.get('X-Request-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test('keeps a safe inbound ID so a trace can span services', async () => {
    const app = createApp({
      tasks: makeStore(),
      webOrigin: origin,
      logger: captureLogger().logger,
    });
    const response = await app.request('/healthz', {
      headers: { 'X-Request-Id': 'edge-proxy.req_0042' },
    });

    expect(response.headers.get('X-Request-Id')).toBe('edge-proxy.req_0042');
  });

  test('replaces an inbound ID that could forge a log line', async () => {
    const { logger, lines } = captureLogger();
    const app = createApp({ tasks: makeStore(), webOrigin: origin, logger });
    const hostile = 'abc12345", "level": "error", "msg": "forged';
    const response = await app.request('/api/tasks', {
      headers: { 'X-Request-Id': hostile },
    });

    expect(response.headers.get('X-Request-Id')).not.toBe(hostile);
    expect(lines.join('\n')).not.toContain('forged');
  });

  test('is present on error responses and exposed to browsers', async () => {
    const app = createApp({
      apiToken: 'local-test-token',
      tasks: makeStore(),
      webOrigin: origin,
      logger: captureLogger().logger,
    });
    const unauthorized = await app.request('/api/tasks', {
      headers: { Origin: origin },
    });

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('X-Request-Id')).toBeTruthy();
    expect(unauthorized.headers.get('Access-Control-Expose-Headers')).toContain(
      'X-Request-Id',
    );
  });
});

describe('structured logs', () => {
  test('writes one JSON object per request, with the request ID', async () => {
    const { logger, lines, records } = captureLogger();
    const app = createApp({ tasks: makeStore(), webOrigin: origin, logger });
    const response = await app.request('/api/tasks');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(records()[0]).toEqual({
      time: '2026-11-03T12:00:00.000Z',
      level: 'info',
      msg: 'request',
      requestId: response.headers.get('X-Request-Id'),
      method: 'GET',
      path: '/api/tasks',
      status: 200,
      durationMs: expect.any(Number),
    });
  });

  test('logs failed and rejected requests at warn and error', async () => {
    const { logger, records } = captureLogger();
    const app = createApp({
      apiToken: 'local-test-token',
      tasks: makeStore({
        async list() {
          throw new Error('connection refused postgres://u:pw@db:5432/x');
        },
      }),
      webOrigin: origin,
      logger,
    });
    await app.request('/api/tasks');
    const failed = await app.request('/api/tasks', {
      headers: { Authorization: 'Bearer local-test-token' },
    });

    expect(failed.status).toBe(500);
    const body = await failed.json();
    expect(body.requestId).toBe(failed.headers.get('X-Request-Id'));

    const logged = records();
    expect(logged.map((record) => [record.level, record.msg])).toEqual([
      ['warn', 'request'],
      ['error', 'request failed'],
      ['error', 'request'],
    ]);
    expect(logged[1]).toMatchObject({
      requestId: body.requestId,
      name: 'Error',
    });
  });

  test('keeps probe requests out of the default log level', async () => {
    const quiet = captureLogger('info');
    const app = createApp({
      tasks: makeStore(),
      webOrigin: origin,
      logger: quiet.logger,
    });
    await app.request('/healthz');
    await app.request('/readyz');
    expect(quiet.lines).toHaveLength(0);

    const verbose = captureLogger('debug');
    const debugApp = createApp({
      tasks: makeStore(),
      webOrigin: origin,
      logger: verbose.logger,
    });
    await debugApp.request('/healthz');
    expect(verbose.records()[0]).toMatchObject({
      level: 'debug',
      path: '/healthz',
    });
  });

  test('never logs credentials, query strings, bodies or error messages', async () => {
    const { logger, lines } = captureLogger('debug');
    const app = createApp({
      apiToken: SECRETS.bearer,
      tasks: makeStore({
        async create() {
          throw new Error(`insert failed for ${SECRETS.body}`);
        },
      }),
      webOrigin: origin,
      logger,
    });
    await app.request(`/api/tasks?token=${SECRETS.query}`, {
      headers: {
        Authorization: `Bearer ${SECRETS.bearer}`,
        Cookie: `session=${SECRETS.cookie}`,
      },
    });
    await app.request('/api/tasks?token=wrong', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    await app.request('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SECRETS.bearer}`,
      },
      body: JSON.stringify({ title: SECRETS.body }),
    });

    expect(lines.length).toBeGreaterThanOrEqual(4);
    const output = lines.join('\n');
    for (const secret of Object.values(SECRETS)) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain('wrong-token');
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('redaction', () => {
  test('masks sensitive keys at any depth', () => {
    expect(
      redact({
        user: 'ada',
        headers: { Authorization: 'x', 'Set-Cookie': 'y', accept: 'json' },
        nested: [{ apiKey: 'k', API_KEY: 'k', clientSecret: 's', ok: 1 }],
        DATABASE_URL: 'postgres://u:p@h/db',
      }),
    ).toEqual({
      user: 'ada',
      headers: {
        Authorization: REDACTED,
        'Set-Cookie': REDACTED,
        accept: 'json',
      },
      nested: [
        { apiKey: REDACTED, API_KEY: REDACTED, clientSecret: REDACTED, ok: 1 },
      ],
      DATABASE_URL: REDACTED,
    });
  });

  test('masks credentials embedded in string values', () => {
    expect(
      redact({
        note: 'sent Bearer abc.DEF-123 and Basic dTpw to postgres://u:pw@db:5432/x',
      }),
    ).toEqual({
      note: `sent Bearer ${REDACTED} and Basic ${REDACTED} to postgres://${REDACTED}@db:5432/x`,
    });
  });

  test('logs only the class of an error and survives cycles', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(redact({ error: new TypeError('secret detail') })).toEqual({
      error: { name: 'TypeError' },
    });
    expect(redact(cyclic)).toEqual({ name: 'loop', self: '[circular]' });
  });

  test('fields cannot overwrite the timestamp, level or message', () => {
    const lines: string[] = [];
    const logger = createLogger({
      write: (line) => lines.push(line),
      now: () => new Date('2026-11-03T12:00:00.000Z'),
    });
    logger.info('real', { msg: 'fake', level: 'debug', time: 'never' });

    expect(JSON.parse(lines[0] ?? '')).toEqual({
      time: '2026-11-03T12:00:00.000Z',
      level: 'info',
      msg: 'real',
    });
  });
});
