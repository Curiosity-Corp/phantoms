# Task recipes for agents and the people who direct them

Each recipe names the files to touch, the steps, and the commands that prove the work. Give the recipe's title and the task to an agent, then check its output against the verification list yourself.

Always start with `bun install --frozen-lockfile`. Always finish with the root verification in `AGENTS.md`.

## Add an endpoint

1. Read `apps/api/AGENTS.md` and `apps/api/src/app.ts`.
2. Add a `zod` schema for the input, then the route under `/api/`. Return JSON and a 4xx status for bad input.
3. If it needs data, add a typed function in `packages/db` and pass it into `createApp` through the store type, as the tasks routes do.
4. Add tests in `apps/api/test/app.test.ts` with a fake store: one success, one invalid input, one auth failure.
5. Document it in the "Try the sample API" section of `docs/getting-started.md`.

Verify: `bun run lint && bun run typecheck && bun test`.

## Add a table and a migration

1. Read `packages/db/AGENTS.md`.
2. Add the table to `packages/db/src/schema.ts`. Give every new column a default or make it nullable.
3. `bun run db:generate`, then read the generated SQL in `packages/db/drizzle/`.
4. Add the query helpers in `packages/db/src` and export them from `index.ts`.
5. Apply to a **disposable** database: `docker compose up -d postgres` then `bun run db:migrate`.

Verify: `bun run db:check && bun run typecheck && bun test`, and the integration test with `DATABASE_URL` set to the disposable database.

## Swap the model provider

1. Read `packages/ai/AGENTS.md` and `docs/ai.md`.
2. Change only `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` in your private `.env` if the new provider speaks the OpenAI-compatible API. No code change is needed.
3. If it does not, add a new adapter inside `packages/ai` that keeps the same `generate` shape. Do not import a provider SDK anywhere else.
4. Add a decision entry in `docs/decisions.md`.

Verify: `bun test packages/ai/test`, and search the web app for the provider name or key: there must be none.

## Add an optional service

1. Read the "Core versus optional services" section of `docs/architecture.md` and decision 003 in `docs/decisions.md`.
2. Add the service to `compose.yaml` behind a Compose profile, so a plain `docker compose up` does not start it.
3. Pin its image to an exact version. Add its settings to `.env.example` with local, disposable values only.
4. Document how to turn it on and off in `docs/getting-started.md`, and add a decision entry.

Verify: `docker compose config` is valid, the default start still works without the service, and `bun test` passes without it.

## A first task to try: add `due_date` to tasks

Ask the agent: "Add an optional `due_date` to tasks, accepted by the API, stored in PostgreSQL, with tests and docs." It combines three recipes: a migration (nullable column), the endpoint change, and the docs update. Read its diff before you merge.
