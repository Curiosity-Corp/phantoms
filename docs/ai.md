# The AI layer

PHANTOMS uses **AI** as a capability boundary, not as a single model vendor. The code in `packages/ai` is a thin adapter over the [AI SDK](https://ai-sdk.dev/docs/foundations/providers-and-models). Its default provider speaks the [OpenAI-compatible protocol](https://ai-sdk.dev/providers/openai-compatible-providers), so a hosted or self-hosted model is selected through server-side configuration. A first-party provider is an optional adapter behind the same interface, and none is the default. See decision 011 in [the decision log](decisions.md).

The adapter is agentic in the practical sense: it can call tools you allowlist, return output validated against a schema, stream text, reach an MCP server you configure, and stop at a budget. It is not an agent framework. For durable multi-step workflows, evaluate a framework such as [Mastra](https://github.com/mastra-ai/mastra) or the [OpenAI Agents SDK for TypeScript](https://github.com/openai/openai-agents-js) behind the same boundary; the starter does not adopt one.

## Configuration

`aiConfigFromEnv()` reads these server-side variables:

- `AI_BASE_URL`: the trusted provider's API base URL (`http` or `https`);
- `AI_API_KEY`: a server-side secret, when the provider requires one;
- `AI_MODEL`: a model identifier supported by the selected provider.

They are deliberately empty in `.env.example`. If none is set the function returns `undefined` and the AI layer is simply off; if only some are set it throws and names the missing variable. The sample API does not call a model at startup, and tests never do. Configure a provider only after reviewing its privacy, retention, access, and cost terms.

```ts
import { aiConfigFromEnv, createAIClient } from '@phantoms/ai';

const config = aiConfigFromEnv();
const ai = config ? createAIClient(config) : undefined;
```

## The adapter interface

Application code depends on `AIAdapter`:

| Member | What it does |
| --- | --- |
| `generate(prompt, options?)` | Returns text. With `options.tools`, runs a bounded tool loop first. |
| `generateObject(schema, prompt, options?)` | Returns data validated against a Zod schema, or throws an `AIError` of kind `invalid_output`. |
| `stream(prompt, options?)` | Yields text as it arrives. |
| `capabilities` | What this endpoint is declared to support: `streaming`, `structuredOutput`, `toolCalling`. |
| `toolNames` | The tools registered with this adapter: the allowlist. |

`options` may carry `tools` (names to enable for this request), `budget`, `signal` (to cancel) and `system` (instructions kept apart from user text). Every failure is an `AIError` with a `kind` (`invalid_request`, `unsupported`, `timeout`, `aborted`, `budget_exceeded`, `invalid_output`, `provider_error`) and a fixed message that never repeats the prompt or the provider's raw error.

Provider capabilities are declared, not assumed. The OpenAI-compatible protocol covers many servers, but not every server supports tool calling or JSON-schema output. `createAIClient` accepts `capabilities: { toolCalling: false }` and the adapter then refuses tool requests up front with `unsupported` instead of failing at the provider.

## Tools

Tools are an allowlist with two gates: the adapter only knows the tools registered at construction, and each request must name the ones it enables. A request that names no tools exposes none, and a name that was not registered is rejected before any model call.

```ts
import { z } from 'zod';
import { createAIClient, defineTool } from '@phantoms/ai';

const lookupTask = defineTool({
  description: 'Look up a task by id.',
  inputSchema: z.object({ id: z.string().min(1) }),
  execute: async ({ id }) => tasks.find(id), // `tasks` is your own data access
});

const ai = createAIClient(config, { tools: { lookupTask } });
const answer = await ai.generate('Is task 42 done?', { tools: ['lookupTask'] });
```

The model's arguments are validated against `inputSchema` before `execute` runs. Treat them as untrusted anyway: keep a tool's reach small, authorize by the signed-in user inside `execute`, and require human approval for anything with an external side effect (see [Security](security.md)).

## Budgets and usage logging

Every request runs under a budget: `timeoutMs` (wall clock, including tool calls), `maxOutputTokens` (per model call), `maxSteps` and `maxTotalTokens` (for tool loops). The values given to `createAIClient` are ceilings (defaults: 15 s, 512 tokens, 5 steps, 20,000 tokens); a request can lower them with `options.budget` but never raise them. A tool loop that hits its step or token budget before answering throws `budget_exceeded` rather than returning a partial answer. Prompts are limited to 8,000 characters by default (`maxPromptChars`) and retries to one (`maxRetries`). Per-user and per-tenant budgets belong to the application, which should count tokens from the usage records below.

Each request produces one usage record, passed to the `onUsage` option or, by default, written as one JSON line on the console:

```json
{"event":"ai.request","adapter":"openai-compatible","model":"my-model","operation":"generate","outcome":"ok","latencyMs":812,"steps":2,"toolCalls":1,"inputTokens":420,"outputTokens":96}
```

It holds the model, latency, token counts and outcome, and never the prompt, the response, or tool input and output. Token counts are present only when the provider reports them.

## Testing with the fake adapter

`createFakeAI()` is a deterministic adapter that makes no network or model calls. It applies the same checks as the real one (prompt limits, budgets, the tool allowlist, declared capabilities, schema validation), records every call, and can script tool calls or force a failure:

```ts
import { createFakeAI } from '@phantoms/ai';

const ai = createFakeAI({ text: 'Task 42 is done.', object: { done: true } });
expect(await ai.generate('Is task 42 done?')).toBe('Task 42 is done.');
expect(ai.calls).toHaveLength(1);
```

To test code that uses the real adapter, give `createAIAdapter` a mock model from the AI SDK's [test helpers](https://ai-sdk.dev/docs/ai-sdk-core/testing) (`MockLanguageModelV4` from `ai/test`); `packages/ai/test/adapter.test.ts` shows the pattern. Run separately gated evaluations for quality-sensitive behavior (below).

## MCP client (optional, off by default)

The [Model Context Protocol](https://modelcontextprotocol.io/specification/2026-07-28) lets a model use tools that another program serves. `connectMCPTools` uses the AI SDK's [MCP client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) and is deliberately narrow:

- It does nothing, and opens no connection, unless `enabled` is `true` (`AI_MCP_ENABLED=true`).
- It connects only to servers listed in server-side configuration (`AI_MCP_SERVERS`, a JSON array). A request, a prompt or a model response can never add a server.
- Each server entry needs `name`, an `http` or `https` `url`, and `allowedTools`, a required non-empty list. Only those tools are exposed, named `<server>_<tool>`; anything else the server offers is ignored. `missing` reports allowlisted tools the server did not offer.
- Connecting has a timeout (`connectTimeoutMs`, default 5 s); tool calls run under the request budget. Redirects are refused. Only the HTTP transport is wired; the local stdio transport is not.
- Retries are not enabled, because a retried tool call can repeat a side effect.

```ts
import { connectMCPTools, createAIClient, mcpConfigFromEnv } from '@phantoms/ai';

const mcp = await connectMCPTools(mcpConfigFromEnv());
const ai = createAIClient(config, { tools: { ...localTools, ...mcp.tools } });
// A request still has to name the tools it wants: { tools: ['docs_search'] }.
// On shutdown: await mcp.close();
```

Treat everything an MCP server returns as untrusted input. Allowlist read-only tools unless a human approves the effect, keep credentials in `headers` on the server only, and do not point the starter at a server you have not reviewed. Server-provided tool annotations are hints, not a policy.

## Add a first-party provider adapter

Any AI SDK provider package can sit behind the same interface. The default needs no vendor package; to use one:

1. Add the provider's package, pinned to an exact version, to `packages/ai` (`bun add --exact @ai-sdk/<provider>` from that folder), after reading its documentation in the [provider list](https://ai-sdk.dev/providers/ai-sdk-providers).
2. Create its model on the server and wrap it with `createAIAdapter`, declaring honestly what that model supports:

```ts
import { createAIAdapter } from '@phantoms/ai';
import { createProvider } from '@ai-sdk/<provider>'; // each package names its own factory

const provider = createProvider({ apiKey: process.env.AI_API_KEY });

export const ai = createAIAdapter({
  name: '<provider>',
  modelId: process.env.AI_MODEL ?? '',
  model: provider(process.env.AI_MODEL ?? ''),
  capabilities: { streaming: true, structuredOutput: true, toolCalling: true },
  limits: { timeoutMs: 15_000, maxOutputTokens: 512, maxSteps: 5, maxTotalTokens: 20_000 },
});
```

3. Keep the import in one server-side module. Application code receives an `AIAdapter`; no other file imports the provider package, and no key or provider name reaches browser code.
4. Add a decision entry in [the decision log](decisions.md), and compare quality with the evaluation harness before switching.

## Point at a local OpenAI-compatible server

Many self-hosted model servers expose the OpenAI-compatible chat API. No code change is needed:

1. Start the server on your machine and note its base URL, usually ending in `/v1`.
2. In your private `.env` set `AI_BASE_URL` to it (for example `http://127.0.0.1:<port>/v1`), `AI_MODEL` to a model name the server lists, and leave `AI_API_KEY` empty unless the server requires one.
3. If the server lacks tool calling or JSON-schema output, say so: `capabilities: { toolCalling: false, structuredOutput: false }` in the config passed to `createAIClient`.

`packages/ai/test/local-server.test.ts` follows these steps against a stub bound to `127.0.0.1`, checking the request path, the optional bearer header, streaming, structured output and a tool call. It is a protocol check, not a quality check of any real model.

## Evaluate quality (gated)

`bun test` never calls a model. For quality-sensitive prompts, edit `packages/ai/eval/cases.ts` and run the harness deliberately against a real model:

```sh
AI_EVAL=1 bun run --filter @phantoms/ai eval
```

It reads the same `AI_*` variables, grades each case with plain code, prints pass or fail with the case id and latency (never the prompt or answer), and exits non-zero when a case fails. Without `AI_EVAL=1` it does nothing. Run it before changing the model, the prompts or the adapter package.

## Keep model access replaceable

- Application code imports the PHANTOMS interface from `@phantoms/ai`, not a provider package.
- Provider construction and model names stay in server-side code and environment configuration.
- Keep prompts, tool schemas, structured outputs, retries, timeouts, and token/cost budgets explicit.
- Validate model output with a schema before it changes records or triggers tools.
- Make provider-specific capabilities visible in the adapter instead of pretending all models support the same features.
- Pin adapter packages and model identifiers; evaluate quality and safety before changing either.

## Privacy and resilience

- Send only data required for the task; remove secrets, credentials, and unnecessary personal information before the request.
- Set a hard timeout, maximum output size, retry limit, and per-user or per-tenant budget.
- Treat provider responses as untrusted input. Escape rendered text and validate all structured fields.
- Record model, adapter name, latency, token usage, and outcome without logging full prompts or responses (the default usage record does this).
- Define what happens when the provider is slow or unavailable. User-facing work should have a clear fallback.
- Keep unit tests deterministic. Use the fake adapter in tests; run separately gated evaluations for quality-sensitive behavior.

## Agent runtime options

Model inference and an agent runtime are different capabilities, and they point in opposite directions:

- **The app calls a model.** Server-side code uses the adapter in `packages/ai`, with its own timeouts, budgets and an allowlist of tools the app defines.
- **An agent runtime calls the app.** A separate program that holds its own conversation and tools (OpenClaw is one example: a personal or team assistant gateway, a Node application with its own identity) reaches the app through a narrow authenticated API and/or an MCP server. The app does not embed it or call it in-process.

This keeps the **A** provider-neutral. The runtime picks its own model, and the app only decides what it is willing to expose. Any harness that can speak HTTP or MCP can attach the same way, so nothing in the app is specific to OpenClaw.

To try it, set `MCP_BEARER_TOKEN` in your private `.env` to a random value of at least 32 characters (for example the output of `openssl rand -hex 32`), keep PostgreSQL and `DATABASE_URL` from the getting-started steps, and start the example, which is not part of the default dev, Compose or image path:

```sh
bun run --filter @phantoms/mcp start
```

It exposes two read-only task tools (`list_tasks`, `get_task`) over MCP's streamable HTTP transport at `http://127.0.0.1:4100/mcp`. Point your MCP client at that URL with an `Authorization: Bearer <token>` header. Add an agent runtime only for a concrete workflow, expose a small allowlist of tools, and require explicit authorization for external side effects. See [Agent runtime options](architecture.md#agent-runtime-options) for the pattern and the facts checked about OpenClaw on 2026-11-04, and [Security](security.md) for the boundary, the advisories page and [OpenClaw's tool-permission guidance](https://docs.openclaw.ai/gateway/security/tool-permissions).
