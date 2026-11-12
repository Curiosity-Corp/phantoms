import { asSchema } from 'ai';
import type { z } from 'zod';
import {
  defaultBudget,
  MAX_PROMPT_CHARS,
  pickTools,
  prepareRequest,
} from './request';
import type {
  AIAdapter,
  AIBudget,
  AICapabilities,
  AIOperation,
  AIRequestOptions,
  AIToolSet,
  AIUsageSink,
} from './types';
import { AIError } from './types';
import { observe, observeStream } from './usage';

export type FakeScriptedToolCall = { name: string; input: unknown };

export type FakeAIOptions = {
  /** Text answer. Default: 'fake response'. */
  text?: string | ((prompt: string) => string);
  /** Value `generateObject` tries to return; it is still validated. */
  object?: unknown | ((prompt: string) => unknown);
  /** Tool calls run, in order, before the text answer when tools are enabled. */
  toolCalls?: readonly FakeScriptedToolCall[];
  /** Registered tools: the allowlist, exactly as for the real adapter. */
  tools?: AIToolSet;
  capabilities?: Partial<AICapabilities>;
  limits?: Partial<AIBudget & { maxPromptChars: number }>;
  /** Characters per streamed chunk. Default 8. */
  chunkSize?: number;
  /** Make every request fail with this kind, to test fallbacks. */
  failWith?: AIError['kind'];
  /** Receives usage records. Default: none, so tests stay quiet. */
  onUsage?: AIUsageSink;
  name?: string;
};

export type FakeCall = {
  operation: AIOperation;
  prompt: string;
  toolNames: string[];
};

export type FakeAdapter = AIAdapter & { readonly calls: FakeCall[] };

const tokensOf = (text: string) => Math.ceil(text.length / 4);

/**
 * A deterministic adapter for tests. It makes no network or model calls, but
 * applies the same checks as the real adapter: prompt length, budgets, the
 * tool allowlist, declared capabilities, and schema validation.
 */
export function createFakeAI(fake: FakeAIOptions = {}): FakeAdapter {
  const registered: AIToolSet = { ...fake.tools };
  const capabilities: AICapabilities = {
    streaming: true,
    structuredOutput: true,
    toolCalling: true,
    ...fake.capabilities,
  };
  const limits = {
    budget: {
      timeoutMs: fake.limits?.timeoutMs ?? defaultBudget.timeoutMs,
      maxOutputTokens:
        fake.limits?.maxOutputTokens ?? defaultBudget.maxOutputTokens,
      maxSteps: fake.limits?.maxSteps ?? defaultBudget.maxSteps,
      maxTotalTokens:
        fake.limits?.maxTotalTokens ?? defaultBudget.maxTotalTokens,
    },
    maxPromptChars: fake.limits?.maxPromptChars ?? MAX_PROMPT_CHARS,
  };
  const name = fake.name ?? 'fake';
  const calls: FakeCall[] = [];
  const signals = { timedOut: () => false, callerAborted: () => false };

  function begin(
    operation: AIOperation,
    prompt: string,
    options: AIRequestOptions | undefined,
    needs?: keyof AICapabilities,
  ) {
    if (needs && !capabilities[needs]) {
      throw new AIError(
        'unsupported',
        `This adapter does not declare ${needs} support.`,
      );
    }
    const request = prepareRequest(
      prompt,
      options,
      limits,
      registered,
      capabilities.toolCalling,
    );
    calls.push({ operation, prompt, toolNames: request.toolNames });
    return {
      request,
      context: {
        adapter: name,
        model: 'fake-model',
        operation,
        sink: fake.onUsage ?? (() => {}),
      },
    };
  }

  async function runScriptedTools(
    request: ReturnType<typeof begin>['request'],
    signal: AbortSignal | undefined,
  ): Promise<number> {
    const script = request.toolNames.length > 0 ? (fake.toolCalls ?? []) : [];
    if (script.length >= request.budget.maxSteps) {
      throw new AIError(
        'budget_exceeded',
        'The tool loop hit its step or token budget before an answer.',
      );
    }
    const tools = pickTools(registered, request.toolNames);
    for (const [index, call] of script.entries()) {
      if (!Object.hasOwn(tools, call.name)) {
        throw new AIError(
          'invalid_request',
          `Tool is not enabled: ${call.name}`,
        );
      }
      const tool = tools[call.name];
      const checked = await asSchema(tool?.inputSchema).validate?.(call.input);
      if (checked && !checked.success) {
        throw new AIError(
          'invalid_output',
          'Tool input did not match its schema.',
        );
      }
      await tool?.execute?.(checked?.success ? checked.value : call.input, {
        toolCallId: `fake-${index}`,
        messages: [],
        ...(signal ? { abortSignal: signal } : {}),
        context: undefined as never,
      });
    }
    return script.length;
  }

  const textFor = (prompt: string) =>
    typeof fake.text === 'function'
      ? fake.text(prompt)
      : (fake.text ?? 'fake response');

  function failIfAsked() {
    if (fake.failWith) {
      throw new AIError(fake.failWith, 'The fake adapter was told to fail.');
    }
  }

  return {
    name,
    model: 'fake-model',
    capabilities: Object.freeze({ ...capabilities }),
    toolNames: Object.freeze(Object.keys(registered)),
    calls,

    async generate(prompt, options) {
      const { request, context } = begin('generate', prompt, options);
      return observe(context, signals, async (tally) => {
        failIfAsked();
        const toolCalls = await runScriptedTools(request, options?.signal);
        const text = textFor(prompt);
        tally.inputTokens = tokensOf(prompt);
        tally.outputTokens = tokensOf(text);
        tally.steps = toolCalls + 1;
        tally.toolCalls = toolCalls;
        return text;
      });
    },

    async generateObject<S extends z.ZodType>(
      schema: S,
      prompt: string,
      options?: AIRequestOptions,
    ): Promise<z.output<S>> {
      const { context } = begin(
        'generateObject',
        prompt,
        options,
        'structuredOutput',
      );
      return observe(context, signals, async (tally) => {
        failIfAsked();
        const candidate =
          typeof fake.object === 'function'
            ? (fake.object as (prompt: string) => unknown)(prompt)
            : fake.object;
        const parsed = schema.safeParse(candidate);
        tally.inputTokens = tokensOf(prompt);
        tally.steps = 1;
        if (!parsed.success) {
          throw new AIError(
            'invalid_output',
            'The model output did not match the expected shape.',
          );
        }
        tally.outputTokens = tokensOf(JSON.stringify(parsed.data));
        return parsed.data as z.output<S>;
      });
    },

    stream(prompt, options) {
      const { request, context } = begin(
        'stream',
        prompt,
        options,
        'streaming',
      );
      return observeStream(context, signals, async function* (tally) {
        failIfAsked();
        const toolCalls = await runScriptedTools(request, options?.signal);
        const text = textFor(prompt);
        const size = Math.max(1, fake.chunkSize ?? 8);
        for (let index = 0; index < text.length; index += size) {
          yield text.slice(index, index + size);
        }
        tally.inputTokens = tokensOf(prompt);
        tally.outputTokens = tokensOf(text);
        tally.steps = toolCalls + 1;
        tally.toolCalls = toolCalls;
      });
    },
  };
}
