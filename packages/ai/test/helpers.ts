import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { AIUsageRecord } from '../src/index';

export const usage = (input: number, output: number) => ({
  inputTokens: {
    total: input,
    noCache: input,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

export const textResult = (text: string, input = 10, output = 5) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: usage(input, output),
  warnings: [],
});

export const toolCallResult = (
  toolName: string,
  input: unknown,
  id = 'call-1',
) => ({
  content: [
    {
      type: 'tool-call' as const,
      toolCallId: id,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls' as const, raw: undefined },
  usage: usage(10, 5),
  warnings: [],
});

export function streamModel(deltas: string[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start' as const, id: 't1' },
          ...deltas.map((delta) => ({
            type: 'text-delta' as const,
            id: 't1',
            delta,
          })),
          { type: 'text-end' as const, id: 't1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: undefined },
            logprobs: undefined,
            usage: usage(3, 7),
          },
        ],
      }),
    }),
  });
}

export function collectUsage() {
  const records: AIUsageRecord[] = [];
  return { records, sink: (record: AIUsageRecord) => records.push(record) };
}
