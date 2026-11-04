import { context, propagation } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
  TracerProvider,
} from '@opentelemetry/sdk-trace';

type Env = Record<string, string | undefined>;

export type Telemetry = {
  /** Undefined while tracing is off, so the app adds no instrumentation. */
  tracerProvider: TracerProvider | undefined;
  /** Flushes queued spans and stops the exporter. Safe to call when off. */
  shutdown: () => Promise<void>;
};

export type TelemetryOptions = {
  env?: Env;
  serviceName?: string;
  /** Test seam: export to this exporter, synchronously, and ignore the env. */
  exporter?: SpanExporter;
};

let globalsInstalled = false;

// Spans need async context to follow a request across awaits, and incoming
// W3C `traceparent` headers need a propagator. Both are process-wide.
function installGlobals() {
  if (globalsInstalled) return;
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  globalsInstalled = true;
}

/** The OTLP/HTTP base URL, or undefined when export is not configured. */
export function otlpEndpointFromEnv(env: Env): string | undefined {
  const raw = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!raw) return undefined;
  let protocol: string;
  try {
    protocol = new URL(raw).protocol;
  } catch {
    protocol = '';
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    // Do not echo the value: an endpoint can embed credentials.
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL.');
  }
  return raw.replace(/\/+$/, '');
}

/**
 * Tracing is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set (or a test passes an
 * exporter). While it is off nothing is exported and no connection is opened.
 * Authentication headers come from OTEL_EXPORTER_OTLP_HEADERS, which the
 * exporter reads itself; this code never logs them.
 */
export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  const env = options.env ?? process.env;
  const endpoint = options.exporter ? undefined : otlpEndpointFromEnv(env);
  if (!options.exporter && !endpoint) {
    return { tracerProvider: undefined, shutdown: async () => {} };
  }

  installGlobals();
  const resource = resourceFromAttributes({
    'service.name':
      env.OTEL_SERVICE_NAME?.trim() || options.serviceName || 'phantoms-api',
  });
  const spanProcessor = options.exporter
    ? new SimpleSpanProcessor({ exporter: options.exporter })
    : new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      });
  const tracerProvider = new TracerProvider({
    resource,
    spanProcessors: [spanProcessor],
  });
  return { tracerProvider, shutdown: () => tracerProvider.shutdown() };
}
