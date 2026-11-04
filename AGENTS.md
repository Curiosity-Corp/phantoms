# Instructions for coding agents

Use this file as the entry point when an AI coding agent is asked to create or change a PHANTOMS app.

## Read before editing

1. Read `README.md` and `docs/architecture.md`.
2. For AI or agent behavior, read `docs/ai.md` and `docs/security.md`.
3. For delivery changes, read `docs/ci-cd.md` and inspect `.gitlab-ci.yml`.
4. Inspect the existing code and lockfile before changing package versions or boundaries.

## Repository rules

- Bun is the required runtime and package manager. Use `bun`, `bunx`, `bun install --frozen-lockfile`, and `bun run`. Keep `packageManager` pinned and commit `bun.lock`.
- Do not add a second JavaScript runtime or package manager to the development, CI, or deployment path.
- Keep PHANTOMS' **A** provider-neutral. Put model-provider setup behind an adapter and server-side environment configuration. Never expose model credentials in browser code.
- Keep OpenClaw optional and isolated. No agent tools, plugins, shell access, or broad permissions are enabled by default.
- Keep Milvus and SeaweedFS optional until retrieval or object-storage requirements justify their operational cost.
- Validate request data at API boundaries, keep database access in `packages/db`, and use reviewed migrations for schema changes.
- Never commit secrets, production connection strings, user data, generated credentials, or private environment files.
- Do not reverse or quietly bypass a decision in `docs/decisions.md`. To change one, add a superseding entry with evidence and a "revisit when" trigger.
- Prefer explicit, small changes. Do not add a dependency for behavior the platform already provides.
- Keep docs accurate to the implemented code. Record material architectural tradeoffs in `docs/decisions.md`.

## Required verification

Run the relevant commands before handoff:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun audit --audit-level high
bun test
bun run build
```

For database changes, also run `bun run db:check` against a disposable local database. For browser-facing journeys, add deterministic Playwright coverage and run it against the built app. Do not put live model calls or mutable external services in unit tests.

## Reporting

Summarize the change, the commands and checks that ran, and any compatibility or operational decision that still needs an owner. Never claim production readiness from a successful build alone.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
