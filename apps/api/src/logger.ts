// One JSON object per line on stdout, with secrets redacted before anything is
// written. The logger never receives request or response bodies from the API.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export type Logger = {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
  /** A logger that adds fixed fields to every line. */
  child: (fields: LogFields) => Logger;
};

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const REDACTED = '[redacted]';

// Substring match on purpose: a false positive hides a harmless value, a
// false negative leaks a secret.
const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|session|private[-_]?key|database[-_]?url|dsn/i;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const MAX_DEPTH = 6;
const RESERVED = new Set(['time', 'level', 'msg']);

export function isLogLevel(value: string): value is LogLevel {
  return value in ORDER;
}

function redactString(value: string): string {
  return value
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(URL_USERINFO, `$1${REDACTED}@`);
}

export function redact(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value === null || typeof value !== 'object') return value;
  // An error message can carry a connection string or a token, so only the
  // class name is logged.
  if (value instanceof Error) return { name: value.name };
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : redact(item, depth + 1, seen);
  }
  return out;
}

export type LoggerOptions = {
  level?: LogLevel;
  /** Receives one finished line, without the trailing newline. */
  write?: (line: string) => void;
  now?: () => Date;
  fields?: LogFields;
};

function writeStdout(line: string) {
  process.stdout.write(`${line}\n`);
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = ORDER[options.level ?? 'info'];
  const write = options.write ?? writeStdout;
  const now = options.now ?? (() => new Date());
  const base = options.fields ?? {};

  function log(level: LogLevel, msg: string, fields: LogFields = {}) {
    if (ORDER[level] < threshold) return;
    const merged = redact({ ...base, ...fields }) as LogFields;
    // Reserved keys are dropped from the fields so they can never overwrite
    // the real timestamp, level or message.
    const rest = Object.fromEntries(
      Object.entries(merged).filter(([key]) => !RESERVED.has(key)),
    );
    let line: string;
    try {
      line = JSON.stringify({
        time: now().toISOString(),
        level,
        msg: redactString(msg),
        ...rest,
      });
    } catch {
      line = JSON.stringify({
        time: now().toISOString(),
        level: 'error',
        msg: 'log line could not be serialised',
      });
    }
    write(line);
  }

  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    child: (extra) =>
      createLogger({ ...options, fields: { ...base, ...extra } }),
  };
}
