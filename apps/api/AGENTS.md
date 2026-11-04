# apps/api: the Hono API

Applies to this folder only. The root `AGENTS.md` still applies.

- Routes live in `src/app.ts`; `createApp` takes its dependencies (task store, token, web origin) as arguments so tests can pass fakes. Keep it that way.
- Validate every request body, query and parameter with `zod` before using it. Return a JSON error with a 4xx status for bad input.
- Never import `postgres` or `drizzle-orm` here. Call functions exported by `@phantoms/db`.
- `/api/*` has CORS, a body size limit and optional bearer auth. Do not weaken them; add new routes under `/api/`.
- Tests: `bun test apps/api/test/app.test.ts` needs no database. `database.integration.test.ts` needs a disposable PostgreSQL (`DATABASE_URL`).
- Check your work: `bun run lint && bun run typecheck && bun test`.
