# The AI layer

PHANTOMS uses **AI** as a capability boundary, not as a single model vendor. The sample uses the AI SDK's provider abstraction and an OpenAI-compatible adapter so a hosted or self-hosted model can be selected through server-side configuration.

The implementation in `packages/ai` expects:

- `AI_BASE_URL`: the trusted provider's API base URL;
- `AI_API_KEY`: a server-side secret, when the provider requires one;
- `AI_MODEL`: a model identifier supported by the selected provider.

These settings are deliberately empty in `.env.example`. The sample does not make a live model request during startup or tests. Configure a provider only when you have reviewed its privacy, retention, access, and cost terms.

## Keep model access replaceable

- Application code imports a small PHANTOMS AI interface, not a vendor package.
- Provider construction and model names stay in server-side code and environment configuration.
- Keep prompts, tool schemas, structured outputs, retries, timeouts, and token/cost budgets explicit.
- Validate model output with a schema before it changes records or triggers tools.
- Make provider-specific capabilities visible in the adapter instead of pretending all models support the same features.
- Pin adapter packages and model identifiers; evaluate quality and safety before changing either.

The AI SDK provider model is described in its [official provider documentation](https://ai-sdk.dev/docs/foundations/providers-and-models) and [OpenAI-compatible provider guide](https://ai-sdk.dev/providers/openai-compatible-providers). Providers that do not implement that protocol can use a separate adapter behind the same application boundary.

## Privacy and resilience

- Send only data required for the task; remove secrets, credentials, and unnecessary personal information before the request.
- Set a hard timeout, maximum output size, retry limit, and per-user or per-tenant budget.
- Treat provider responses as untrusted input. Escape rendered text and validate all structured fields.
- Record model, adapter version, latency, token usage, and outcome without logging full prompts or responses by default.
- Define what happens when the provider is slow or unavailable. User-facing work should have a clear fallback.
- Keep unit tests deterministic. Use a fake adapter in tests; run separately gated evaluations for quality-sensitive behavior.

## Agents and tool use

An agent runtime is a separate capability from model inference. Add OpenClaw only for a concrete workflow, expose a small allowlist of tools, and require explicit authorization for external side effects. See [Security](security.md) for the boundary and [OpenClaw's tool-permission guidance](https://docs.openclaw.ai/gateway/security/tool-permissions).
