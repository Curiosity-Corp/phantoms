# packages/db: schema, migrations and queries

Applies to this folder only. The root `AGENTS.md` still applies.

- This is the only package that talks to PostgreSQL. Other packages import from `@phantoms/db`.
- Schema changes: edit `src/schema.ts`, run `bun run db:generate`, read the new SQL in `drizzle/`, commit it with the schema. Never edit a migration that has been merged; add a new one.
- Run `bun run db:check` after generating. Run `bun run db:migrate` only against a disposable local database, never one that holds real data.
- Make new columns nullable or give them a default, so existing rows keep working.
- Keep query helpers small and typed (`src/tasks.ts` is the pattern). Do not build SQL from strings.
- Check your work: `bun run lint && bun run typecheck && bun run db:check`, then the integration test in `apps/api/test`.
