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
- Log through the API's structured logger (one JSON object per line, with the request ID). Never log request bodies, headers, query strings, prompts, responses or error messages that may carry secrets; the logger redacts by key name as a backstop, not as permission.
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
bun run test:e2e
```

`bun run test:e2e` drives the built static web app in a browser, so run it after `bun run build`. It needs the pinned Playwright browsers (`bunx playwright install chromium` once, or use the pinned CI image) but no database, model provider or network. For database changes, also run `bun run db:check` against a disposable local database. For browser-facing journeys, add deterministic Playwright coverage in `e2e/` (files end in `.e2e.ts`, never `.spec.ts`, so `bun test` does not load them). Do not put live model calls or mutable external services in unit or e2e tests.

## Reporting

Summarize the change, the commands and checks that ran, and any compatibility or operational decision that still needs an owner. Never claim production readiness from a successful build alone.
