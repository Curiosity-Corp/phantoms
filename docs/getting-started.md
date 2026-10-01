# Getting started

This walkthrough runs the Next.js web app, Hono API, and PostgreSQL locally. Bun is used for JavaScript installation, scripts, and execution.

## Prerequisites

- Bun 1.4.2
- Docker Compose
- Git

Verify Bun with `bun --version`. The version should match the pin in the root `package.json`.

## Install and run

From the repository root:

```sh
bun install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
bun run dev
```

The sample `.env` values are local-only. The API binds to `127.0.0.1:4000` and the web app to `127.0.0.1:3000`.

## Try the sample API

In another terminal, list tasks:

```sh
curl http://127.0.0.1:4000/api/tasks
```

Create one:

```sh
curl http://127.0.0.1:4000/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Learn the PHANTOMS boundaries"}'
```

`/healthz` reports whether the API process is alive. `/readyz` checks its database connection. The local example uses loopback binding and does not configure user authentication. The container requires `API_BEARER_TOKEN` before it will bind beyond loopback; replace this shared starter gate with OIDC and user/tenant authorization for a real app.

## Run checks

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

To validate migrations and database readiness:

```sh
bun run db:check
curl --fail http://127.0.0.1:4000/readyz
```

## AI adapter

The `@phantoms/ai` package contains a small provider adapter, but no model call runs on startup. Configure `AI_BASE_URL`, `AI_MODEL`, and, when required, `AI_API_KEY` on the server before connecting this package to a user-facing workflow. Do not add model credentials to `NEXT_PUBLIC_*` variables.

## Stop local services

Stop the development process with Ctrl+C, then stop PostgreSQL with:

```sh
docker compose stop postgres
```

The database volume persists across stops. Removing it permanently deletes local development data; do so only when that is intended:

```sh
docker compose down --volumes
```

## Troubleshooting

- **Port already in use:** change `API_PORT` or stop the process holding 4000; change the web port through the Next dev command if 3000 is occupied.
- **Database unavailable:** check `docker compose ps`, `docker compose logs postgres`, and `DATABASE_URL` in `.env`.
- **Migration fails:** confirm the database is healthy, then run `bun run db:migrate` again. Review migration files before applying them to valuable data.
- **Frozen install fails:** verify Bun 1.4.2 and restore `bun.lock` from version control; do not regenerate the lockfile as an automatic fix.
