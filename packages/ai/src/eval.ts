import type { z } from 'zod';
import type { AIAdapter } from './types';

type CaseBase = { id: string; prompt: string };

export type EvalCase =
  | (CaseBase & {
      kind: 'text';
      /** Return true, or a short reason for failing. */
      check: (output: string) => true | string;
    })
  | (CaseBase & {
      kind: 'object';
      schema: z.ZodType;
      check: (output: unknown) => true | string;
    });

export type EvalResult = {
  id: string;
  passed: boolean;
  /** Why it failed. Never includes the prompt or the model's output. */
  reason?: string;
  latencyMs: number;
};

export type EvalReport = {
  results: EvalResult[];
  passed: number;
  total: number;
};

/**
 * Run quality-sensitive prompts against an adapter and grade the answers with
 * plain code. This is not part of `bun test`: run it deliberately, against a
 * real model, with `bun run --filter @phantoms/ai eval`.
 */
export async function runEval(
  adapter: AIAdapter,
  cases: readonly EvalCase[],
): Promise<EvalReport> {
  const results: EvalResult[] = [];
  for (const item of cases) {
    const started = performance.now();
    let verdict: true | string;
    try {
      verdict =
        item.kind === 'text'
          ? item.check(await adapter.generate(item.prompt))
          : item.check(await adapter.generateObject(item.schema, item.prompt));
    } catch (error) {
      verdict = error instanceof Error ? error.name : 'unknown error';
    }
    results.push({
      id: item.id,
      passed: verdict === true,
      ...(verdict === true ? {} : { reason: verdict }),
      latencyMs: Math.round(performance.now() - started),
    });
  }
  return {
    results,
    passed: results.filter((result) => result.passed).length,
    total: results.length,
  };
}
