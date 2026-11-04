import type {
  AIErrorKind,
  AIOperation,
  AIOutcome,
  AIUsageRecord,
  AIUsageSink,
} from './types';
import { AIError } from './types';

/** Default sink: one JSON line per request, with no prompt or response text. */
export const consoleUsageSink: AIUsageSink = (record) => {
  console.info(JSON.stringify({ event: 'ai.request', ...record }));
};

export type UsageTally = {
  inputTokens?: number;
  outputTokens?: number;
  steps: number;
  toolCalls: number;
};

type Context = {
  adapter: string;
  model: string;
  operation: AIOperation;
  sink: AIUsageSink;
};

function emit(
  context: Context,
  started: number,
  outcome: AIOutcome,
  tally: UsageTally,
) {
  const record: AIUsageRecord = {
    adapter: context.adapter,
    model: context.model,
    operation: context.operation,
    outcome,
    latencyMs: Math.round(performance.now() - started),
    steps: tally.steps,
    toolCalls: tally.toolCalls,
    ...(tally.inputTokens === undefined
      ? {}
      : { inputTokens: tally.inputTokens }),
    ...(tally.outputTokens === undefined
      ? {}
      : { outputTokens: tally.outputTokens }),
  };
  try {
    context.sink(record);
  } catch {
    // A failing log sink must never break or change the request.
  }
}

const NAMES_BY_KIND: [RegExp, AIErrorKind][] = [
  [
    /NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse/,
    'invalid_output',
  ],
];

function nameChain(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    names.push(current.name);
    current = current.cause;
  }
  return names;
}

/** Map any thrown value to an AIError with a fixed, prompt-free message. */
export function toAIError(
  error: unknown,
  signals: { timedOut: () => boolean; callerAborted: () => boolean },
): AIError {
  if (error instanceof AIError) return error;
  const names = nameChain(error);
  if (names.includes('TimeoutError') || signals.timedOut()) {
    return new AIError('timeout', 'The model request timed out.', {
      cause: error,
    });
  }
  if (names.includes('AbortError') || signals.callerAborted()) {
    return new AIError('aborted', 'The model request was cancelled.', {
      cause: error,
    });
  }
  for (const name of names) {
    for (const [pattern, kind] of NAMES_BY_KIND) {
      if (pattern.test(name)) {
        return new AIError(
          kind,
          'The model output did not match the expected shape.',
          { cause: error },
        );
      }
    }
  }
  return new AIError('provider_error', 'The model request failed.', {
    cause: error,
  });
}

export async function observe<T>(
  context: Context,
  signals: { timedOut: () => boolean; callerAborted: () => boolean },
  run: (tally: UsageTally) => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const tally: UsageTally = { steps: 0, toolCalls: 0 };
  try {
    const value = await run(tally);
    emit(context, started, 'ok', tally);
    return value;
  } catch (error) {
    const mapped = toAIError(error, signals);
    emit(context, started, mapped.kind, tally);
    throw mapped;
  }
}

export async function* observeStream(
  context: Context,
  signals: { timedOut: () => boolean; callerAborted: () => boolean },
  run: (tally: UsageTally) => AsyncGenerator<string>,
): AsyncGenerator<string> {
  const started = performance.now();
  const tally: UsageTally = { steps: 0, toolCalls: 0 };
  let outcome: AIOutcome = 'aborted'; // the consumer stopped reading early
  try {
    yield* run(tally);
    outcome = 'ok';
  } catch (error) {
    const mapped = toAIError(error, signals);
    outcome = mapped.kind;
    throw mapped;
  } finally {
    emit(context, started, outcome, tally);
  }
}
