import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  generateText,
  type LanguageModel,
  Output,
  type StepResult,
  stepCountIs,
  streamText,
  type ToolSet,
} from 'ai';
import type { z } from 'zod';
import { type AIConfig, aiConfigSchema } from './config';
import {
  MAX_PROMPT_CHARS,
  type PreparedRequest,
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
import {
  consoleUsageSink,
  observe,
  observeStream,
  type UsageTally,
} from './usage';

export type AIAdapterOptions = {
  /** Adapter name used in usage records, for example the provider's name. */
  name: string;
  /** Model identifier used in usage records. */
  modelId: string;
  /** Any AI SDK language model: a provider package's model, or a mock. */
  model: LanguageModel;
  /** Declare what this model and endpoint support. Nothing is assumed. */
  capabilities: AICapabilities;
  /** Ceilings for every request. */
  limits: AIBudget & { maxPromptChars?: number; maxRetries?: number };
  /** Registered tools: the allowlist. A request names the ones it may use. */
  tools?: AIToolSet;
  /** Receives one record per request. Default: one JSON line on the console. */
  onUsage?: AIUsageSink;
};

type Totals = { input?: number; output?: number };

function addTokens(total: number | undefined, more: number | undefined) {
  return more === undefined ? total : (total ?? 0) + more;
}

function tallyFromSteps(
  tally: UsageTally,
  steps: ReadonlyArray<StepResult<ToolSet, never>>,
) {
  const totals: Totals = {};
  for (const step of steps) {
    totals.input = addTokens(totals.input, step.usage.inputTokens);
    totals.output = addTokens(totals.output, step.usage.outputTokens);
  }
  if (totals.input !== undefined) tally.inputTokens = totals.input;
  if (totals.output !== undefined) tally.outputTokens = totals.output;
  tally.steps = steps.length;
  tally.toolCalls = steps.reduce((sum, step) => sum + step.toolCalls.length, 0);
}

/**
 * Build the PHANTOMS adapter around any AI SDK language model. Application
 * code depends on `AIAdapter`, not on a provider package.
 */
export function createAIAdapter(options: AIAdapterOptions): AIAdapter {
  const registered: AIToolSet = { ...options.tools };
  const sink = options.onUsage ?? consoleUsageSink;
  const limits = {
    budget: {
      timeoutMs: options.limits.timeoutMs,
      maxOutputTokens: options.limits.maxOutputTokens,
      maxSteps: options.limits.maxSteps,
      maxTotalTokens: options.limits.maxTotalTokens,
    },
    maxPromptChars: options.limits.maxPromptChars ?? MAX_PROMPT_CHARS,
  };
  const maxRetries = options.limits.maxRetries ?? 1;

  function begin(
    operation: AIOperation,
    prompt: string,
    requestOptions: AIRequestOptions | undefined,
    needs?: keyof AICapabilities,
  ) {
    if (needs && !options.capabilities[needs]) {
      throw new AIError(
        'unsupported',
        `This adapter does not declare ${needs} support.`,
      );
    }
    const request = prepareRequest(
      prompt,
      requestOptions,
      limits,
      registered,
      options.capabilities.toolCalling,
    );
    const timeout = AbortSignal.timeout(request.budget.timeoutMs);
    const caller = requestOptions?.signal;
    const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;
    return {
      request,
      signal,
      context: {
        adapter: options.name,
        model: options.modelId,
        operation,
        sink,
      },
      signals: {
        timedOut: () => timeout.aborted,
        callerAborted: () => caller?.aborted === true,
      },
    };
  }

  function callSettings(request: PreparedRequest, signal: AbortSignal) {
    const tools = pickTools(registered, request.toolNames);
    const hasTools = request.toolNames.length > 0;
    const { budget } = request;
    const overTokenBudget = ({
      steps,
    }: {
      steps: ReadonlyArray<StepResult<ToolSet, never>>;
    }) =>
      steps.reduce(
        (sum, step) =>
          sum + (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0),
        0,
      ) >= budget.maxTotalTokens;
    return {
      model: options.model,
      prompt: request.prompt,
      ...(request.system === undefined ? {} : { system: request.system }),
      abortSignal: signal,
      maxOutputTokens: budget.maxOutputTokens,
      maxRetries,
      ...(hasTools
        ? {
            tools,
            stopWhen: [stepCountIs(budget.maxSteps), overTokenBudget],
            timeout: { toolMs: budget.timeoutMs },
          }
        : {}),
    };
  }

  return {
    name: options.name,
    model: options.modelId,
    capabilities: Object.freeze({ ...options.capabilities }),
    toolNames: Object.freeze(Object.keys(registered)),

    async generate(prompt, requestOptions) {
      const { request, signal, context, signals } = begin(
        'generate',
        prompt,
        requestOptions,
      );
      return observe(context, signals, async (tally) => {
        const result = await generateText(callSettings(request, signal));
        tallyFromSteps(tally, result.steps);
        if (result.finishReason === 'tool-calls') {
          throw new AIError(
            'budget_exceeded',
            'The tool loop hit its step or token budget before an answer.',
          );
        }
        return result.text;
      });
    },

    async generateObject<S extends z.ZodType>(
      schema: S,
      prompt: string,
      requestOptions?: AIRequestOptions,
    ): Promise<z.output<S>> {
      const { request, signal, context, signals } = begin(
        'generateObject',
        prompt,
        requestOptions,
        'structuredOutput',
      );
      return observe(context, signals, async (tally) => {
        const result = await generateText({
          ...callSettings(request, signal),
          output: Output.object({ schema }),
        });
        tallyFromSteps(tally, result.steps);
        return result.output as z.output<S>;
      });
    },

    stream(prompt, requestOptions) {
      const { request, signal, context, signals } = begin(
        'stream',
        prompt,
        requestOptions,
        'streaming',
      );
      return observeStream(context, signals, async function* (tally) {
        const result = streamText({
          ...callSettings(request, signal),
          // Errors reach the caller through fullStream; do not let the SDK
          // print the raw provider error, which can echo request content.
          onError: () => {},
        });
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') yield part.text;
          else if (part.type === 'error') throw part.error;
        }
        tallyFromSteps(tally, await result.steps);
      });
    },
  };
}

/**
 * The provider-neutral default: any server that speaks the OpenAI-compatible
 * chat API, hosted or local, chosen by server-side configuration.
 */
export function createAIClient(
  input: AIConfig,
  extras: { tools?: AIToolSet; onUsage?: AIUsageSink } = {},
): AIAdapter {
  const config = aiConfigSchema.parse(input);
  const provider = createOpenAICompatible({
    name: 'configured',
    baseURL: config.baseURL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    supportsStructuredOutputs: config.capabilities.structuredOutput,
  });
  return createAIAdapter({
    name: 'openai-compatible',
    modelId: config.model,
    model: provider(config.model),
    capabilities: config.capabilities,
    limits: {
      timeoutMs: config.timeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      maxSteps: config.maxSteps,
      maxTotalTokens: config.maxTotalTokens,
      maxPromptChars: config.maxPromptChars,
      maxRetries: config.maxRetries,
    },
    ...(extras.tools ? { tools: extras.tools } : {}),
    ...(extras.onUsage ? { onUsage: extras.onUsage } : {}),
  });
}
