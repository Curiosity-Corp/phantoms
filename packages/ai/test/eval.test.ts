import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { createFakeAI, type EvalCase, runEval } from '../src/index';

const cases: EvalCase[] = [
  {
    kind: 'text',
    id: 'mentions-bun',
    prompt: 'Name the runtime.',
    check: (output) => output.includes('Bun') || 'missing the runtime name',
  },
  {
    kind: 'object',
    id: 'classifies',
    prompt: 'Classify.',
    schema: z.object({ label: z.string() }),
    check: (output) =>
      (output as { label: string }).label === 'ok' || 'wrong label',
  },
];

describe('evaluation harness', () => {
  test('grades text and structured answers', async () => {
    const report = await runEval(
      createFakeAI({ text: 'Bun', object: { label: 'ok' } }),
      cases,
    );

    expect(report.passed).toBe(2);
    expect(report.total).toBe(2);
  });

  test('reports reasons and errors without prompt or output text', async () => {
    const report = await runEval(
      createFakeAI({ text: 'Deno', object: { wrong: true } }),
      cases,
    );

    expect(report.passed).toBe(0);
    expect(report.results[0]?.reason).toBe('missing the runtime name');
    expect(report.results[1]?.reason).toBe('AIError');
    expect(JSON.stringify(report)).not.toContain('Name the runtime');
  });
});
