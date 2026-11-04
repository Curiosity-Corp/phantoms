import { afterAll, describe, expect, test } from 'bun:test';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { createApp } from '../src/app';
import { createTelemetry, otlpEndpointFromEnv } from '../src/telemetry';
import { captureLogger, makeStore } from './helpers';

const origin = 'http://localhost:3000';

describe('OpenTelemetry is off by default', () => {
  test('stays off without OTEL_EXPORTER_OTLP_ENDPOINT', async () => {
    for (const env of [{}, { OTEL_EXPORTER_OTLP_ENDPOINT: '  ' }]) {
      const telemetry = createTelemetry({ env });
      expect(telemetry.tracerProvider).toBeUndefined();
      await telemetry.shutdown();
    }
  });

  test('the trace-specific variable alone does not turn it on', () => {
    const telemetry = createTelemetry({
      env: { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:4318' },
    });
    expect(telemetry.tracerProvider).toBeUndefined();
  });

  test('rejects a malformed endpoint without echoing it', () => {
    const secretUrl = 'ftp://user:hunter2@collector.example';
    expect(() =>
      otlpEndpointFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: secretUrl }),
    ).toThrow('must be an http(s) URL');
    try {
      otlpEndpointFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: secretUrl });
    } catch (error) {
      expect(String(error)).not.toContain('hunter2');
    }
    expect(() =>
      otlpEndpointFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'not a url' }),
    ).toThrow('must be an http(s) URL');
  });

  test('trims trailing slashes from the base URL', () => {
    expect(
      otlpEndpointFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://h:4318//' }),
    ).toBe('http://h:4318');
  });
});

// These run under the pinned Bun release, which is what proves the OTel
// packages work on Bun (not just on Node): spans are produced for real
// requests, carry the route and status, follow async work, and are exported
// over OTLP/HTTP to a collector.
describe('spans under Bun', () => {
  const exporter = new InMemorySpanExporter();
  const telemetry = createTelemetry({ exporter, serviceName: 'phantoms-test' });
  const { logger, records } = captureLogger();
  const app = createApp({
    tasks: makeStore({
      async list() {
        // Async work between the middleware and the handler result.
        await Bun.sleep(5);
        return [];
      },
    }),
    webOrigin: origin,
    logger,
    tracerProvider: telemetry.tracerProvider,
  });

  afterAll(() => telemetry.shutdown());

  test('produces one server span per request with route and status', async () => {
    exporter.reset();
    const response = await app.request('/api/tasks');
    const spans = exporter.getFinishedSpans();

    expect(response.status).toBe(200);
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span?.attributes['http.request.method']).toBe('GET');
    expect(span?.attributes['http.route']).toBe('/api/tasks');
    expect(span?.attributes['http.response.status_code']).toBe(200);
    expect(span?.attributes['http.request.id']).toBe(
      response.headers.get('X-Request-Id') ?? undefined,
    );
    expect(span?.resource.attributes['service.name']).toBe('phantoms-test');
  });

  test('puts the trace and span IDs on the matching log line', async () => {
    exporter.reset();
    await app.request('/api/tasks');
    const span = exporter.getFinishedSpans()[0];
    const line = records().at(-1);

    expect(span?.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(line?.traceId).toBe(span?.spanContext().traceId);
    expect(line?.spanId).toBe(span?.spanContext().spanId);
  });

  test('continues a trace sent in a W3C traceparent header', async () => {
    exporter.reset();
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    await app.request('/api/tasks', {
      headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
    });
    const span = exporter.getFinishedSpans()[0];

    expect(span?.spanContext().traceId).toBe(traceId);
    expect(span?.parentSpanContext?.spanId).toBe('00f067aa0ba902b7');
  });

  test('marks a failed request as an error span', async () => {
    exporter.reset();
    const failing = createApp({
      tasks: makeStore({
        async list() {
          throw new Error('boom');
        },
      }),
      webOrigin: origin,
      logger,
      tracerProvider: telemetry.tracerProvider,
    });
    const response = await failing.request('/api/tasks');
    const span = exporter.getFinishedSpans()[0];

    expect(response.status).toBe(500);
    expect(span?.attributes['http.response.status_code']).toBe(500);
  });
});

describe('OTLP export under Bun', () => {
  test('sends spans to the configured endpoint and only then', async () => {
    const received: { path: string; body: string; type: string }[] = [];
    const collector = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        received.push({
          path: new URL(request.url).pathname,
          body: await request.text(),
          type: request.headers.get('content-type') ?? '',
        });
        return Response.json({});
      },
    });

    try {
      const telemetry = createTelemetry({
        env: {
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.port}`,
          OTEL_SERVICE_NAME: 'phantoms-otlp-test',
        },
      });
      expect(telemetry.tracerProvider).toBeDefined();
      const app = createApp({
        tasks: makeStore(),
        webOrigin: origin,
        logger: captureLogger().logger,
        tracerProvider: telemetry.tracerProvider,
      });
      await app.request('/api/tasks');
      // Spans are batched; shutdown flushes them.
      await telemetry.shutdown();

      expect(received).toHaveLength(1);
      expect(received[0]?.path).toBe('/v1/traces');
      expect(received[0]?.type).toContain('application/json');
      expect(received[0]?.body).toContain('phantoms-otlp-test');
      expect(received[0]?.body).toContain('/api/tasks');
    } finally {
      await collector.stop(true);
    }
  });
});
