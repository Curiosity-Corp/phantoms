import type { AIBudget, AIRequestOptions, AIToolSet } from './types';
import { AIError } from './types';

export const MAX_PROMPT_CHARS = 8_000;
export const MAX_SYSTEM_CHARS = 4_000;

export const defaultBudget: AIBudget = {
  timeoutMs: 15_000,
  maxOutputTokens: 512,
  maxSteps: 5,
  maxTotalTokens: 20_000,
};

/** Request values may lower a ceiling but never raise it. */
export function resolveBudget(
  ceiling: AIBudget,
  requested: Partial<AIBudget> = {},
): AIBudget {
  const pick = (key: keyof AIBudget): number => {
    const value = requested[key];
    if (value === undefined) return ceiling[key];
    if (!Number.isFinite(value) || value < 1) {
      throw new AIError('invalid_request', `Budget ${key} must be at least 1.`);
    }
    return Math.min(Math.floor(value), ceiling[key]);
  };
  return {
    timeoutMs: pick('timeoutMs'),
    maxOutputTokens: pick('maxOutputTokens'),
    maxSteps: pick('maxSteps'),
    maxTotalTokens: pick('maxTotalTokens'),
  };
}

export type PreparedRequest = {
  prompt: string;
  system?: string;
  budget: AIBudget;
  toolNames: string[];
};

/** Checks shared by every adapter, so the fake behaves like the real one. */
export function prepareRequest(
  prompt: string,
  options: AIRequestOptions | undefined,
  limits: { budget: AIBudget; maxPromptChars: number },
  registered: AIToolSet,
  toolCalling: boolean,
): PreparedRequest {
  if (prompt.length === 0 || prompt.length > limits.maxPromptChars) {
    throw new AIError(
      'invalid_request',
      `Prompt length must be between 1 and ${limits.maxPromptChars} characters.`,
    );
  }
  const system = options?.system;
  if (system !== undefined && system.length > MAX_SYSTEM_CHARS) {
    throw new AIError(
      'invalid_request',
      `System text must be at most ${MAX_SYSTEM_CHARS} characters.`,
    );
  }
  const toolNames = [...new Set(options?.tools ?? [])];
  if (toolNames.length > 0 && !toolCalling) {
    throw new AIError(
      'unsupported',
      'This adapter does not declare tool calling support.',
    );
  }
  for (const name of toolNames) {
    if (!Object.hasOwn(registered, name)) {
      throw new AIError('invalid_request', `Tool is not allowlisted: ${name}`);
    }
  }
  return {
    prompt,
    ...(system === undefined ? {} : { system }),
    budget: resolveBudget(limits.budget, options?.budget),
    toolNames,
  };
}

export function pickTools(registered: AIToolSet, names: string[]): AIToolSet {
  return Object.fromEntries(
    names.map((name) => [name, registered[name]]),
  ) as AIToolSet;
}
