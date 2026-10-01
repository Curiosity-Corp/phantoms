import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { z } from 'zod';

const aiConfigSchema = z.object({
  baseURL: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  apiKey: z.string().min(1).optional(),
  model: z.string().trim().min(1).max(160),
  timeoutMs: z.number().int().min(500).max(60_000).default(15_000),
});

export type AIConfig = z.input<typeof aiConfigSchema>;

export function createAIClient(input: AIConfig) {
  const config = aiConfigSchema.parse(input);
  const provider = createOpenAICompatible({
    name: 'configured',
    baseURL: config.baseURL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
  const model = provider(config.model);

  return {
    async generate(prompt: string): Promise<string> {
      if (prompt.length === 0 || prompt.length > 8_000) {
        throw new Error('Prompt length must be between 1 and 8000 characters.');
      }

      const result = await generateText({
        model,
        prompt,
        abortSignal: AbortSignal.timeout(config.timeoutMs),
        maxOutputTokens: 512,
      });

      return result.text;
    },
  };
}
