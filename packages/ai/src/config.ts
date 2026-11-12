import { z } from 'zod';
import { defaultBudget, MAX_PROMPT_CHARS } from './request';

const capabilitiesSchema = z
  .object({
    streaming: z.boolean().default(true),
    structuredOutput: z.boolean().default(true),
    toolCalling: z.boolean().default(true),
  })
  .default({ streaming: true, structuredOutput: true, toolCalling: true });

export const aiConfigSchema = z.object({
  baseURL: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  apiKey: z.string().min(1).optional(),
  model: z.string().trim().min(1).max(160),
  /** Declared abilities of the endpoint. Turn off what your server lacks. */
  capabilities: capabilitiesSchema,
  /** Ceilings for every request; a request may only lower them. */
  timeoutMs: z
    .number()
    .int()
    .min(500)
    .max(60_000)
    .default(defaultBudget.timeoutMs),
  maxOutputTokens: z
    .number()
    .int()
    .min(1)
    .max(8_192)
    .default(defaultBudget.maxOutputTokens),
  maxSteps: z.number().int().min(1).max(10).default(defaultBudget.maxSteps),
  maxTotalTokens: z
    .number()
    .int()
    .min(1)
    .max(200_000)
    .default(defaultBudget.maxTotalTokens),
  maxPromptChars: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .default(MAX_PROMPT_CHARS),
  maxRetries: z.number().int().min(0).max(5).default(1),
});

export type AIConfig = z.input<typeof aiConfigSchema>;

type Env = Record<string, string | undefined>;

/**
 * Read AI_BASE_URL, AI_API_KEY and AI_MODEL. Returns undefined when the AI
 * layer is not configured at all, and throws when it is half configured.
 */
export function aiConfigFromEnv(env: Env = process.env): AIConfig | undefined {
  const baseURL = env.AI_BASE_URL?.trim();
  const model = env.AI_MODEL?.trim();
  const apiKey = env.AI_API_KEY?.trim();
  if (!baseURL && !model) return undefined;
  const missing = [
    ...(baseURL ? [] : ['AI_BASE_URL']),
    ...(model ? [] : ['AI_MODEL']),
  ];
  if (missing.length > 0) {
    throw new Error(`AI is half configured; also set ${missing.join(', ')}.`);
  }
  return {
    baseURL: baseURL as string,
    model: model as string,
    ...(apiKey ? { apiKey } : {}),
  };
}
