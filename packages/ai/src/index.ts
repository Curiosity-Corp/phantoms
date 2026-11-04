export type { AIAdapterOptions } from './client';
export { createAIAdapter, createAIClient } from './client';
export type { AIConfig } from './config';
export { aiConfigFromEnv, aiConfigSchema } from './config';
export type { EvalCase, EvalReport, EvalResult } from './eval';
export { runEval } from './eval';
export type { FakeAdapter, FakeAIOptions, FakeCall } from './fake';
export { createFakeAI } from './fake';
export type {
  MCPClientLike,
  MCPConfig,
  MCPTools,
  MCPToolsOptions,
} from './mcp';
export { connectMCPTools, mcpConfigFromEnv, mcpConfigSchema } from './mcp';
export { defaultBudget, resolveBudget } from './request';
export { defineTool } from './tools';
export type {
  AIAdapter,
  AIBudget,
  AICapabilities,
  AIErrorKind,
  AIOperation,
  AIOutcome,
  AIRequestOptions,
  AITool,
  AIToolSet,
  AIUsageRecord,
  AIUsageSink,
} from './types';
export { AIError } from './types';
export { consoleUsageSink } from './usage';
