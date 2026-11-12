# packages/ai: the provider-neutral AI adapter

Applies to this folder only. The root `AGENTS.md` still applies.

- Application code calls `createAIClient` and never imports a provider SDK directly. Endpoint, key and model come from server-side environment variables (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`).
- Never put a key or a model-provider name in browser code or in a `NEXT_PUBLIC_` variable.
- Keep the limits: prompt length, timeout and output tokens. Raise one only with a reason recorded in `docs/decisions.md`.
- Treat model output as untrusted input: validate it before using it as data, and never run it as code or a command.
- Tests make no live model calls: `bun test packages/ai/test`.
- Check your work: `bun run lint && bun run typecheck && bun test`.
