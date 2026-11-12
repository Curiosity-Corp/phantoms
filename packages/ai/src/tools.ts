import { tool } from 'ai';
import type { z } from 'zod';
import type { AITool } from './types';

/**
 * Define a tool with a Zod input schema. The model's arguments are validated
 * against the schema before `execute` runs; `execute` receives typed input.
 * Treat the arguments as untrusted and keep the tool's reach small.
 */
export function defineTool<S extends z.ZodType>(definition: {
  description: string;
  inputSchema: S;
  execute: (
    input: z.output<S>,
    context: { signal?: AbortSignal },
  ) => unknown | Promise<unknown>;
}): AITool {
  return tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: async (input, options) =>
      definition.execute(input as z.output<S>, {
        ...(options.abortSignal ? { signal: options.abortSignal } : {}),
      }),
  });
}
