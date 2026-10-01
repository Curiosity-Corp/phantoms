# PHANTOMS

**A free, agent-ready learning stack for building modern TypeScript applications with Bun.**

PHANTOMS gives a person or an AI coding agent one coherent starting point for the application, data, AI, retrieval, and delivery decisions that otherwise get re-decided in every project. The repository is both a learning guide and a runnable starter: clone it, read `AGENTS.md`, follow the setup guide, and grow only the services the app needs.

## The stack

| Letter | Technology | Purpose |
| --- | --- | --- |
| **P** | [PostgreSQL](https://www.postgresql.org/) | Durable relational data and transactions |
| **H** | [Hono](https://hono.dev/) | Small, typed HTTP API, served by Bun |
| **A** | **AI** | Provider-neutral model access behind a replaceable adapter |
| **N** | [Next.js](https://nextjs.org/) | Web application and App Router |
| **T** | [Turborepo](https://turborepo.dev/) | Task graph and monorepo caching |
| **O** | [OpenClaw](https://github.com/openclaw/openclaw) | Optional agent runtime for scoped tool workflows |
| **M** | [Milvus](https://milvus.io/) | Optional vector and hybrid retrieval |
| **S** | [SeaweedFS](https://github.com/seaweedfs/seaweedfs) | Optional S3-compatible object storage |

Bun is the required JavaScript runtime and package manager throughout this starter. The source spec's UI, validation, data, identity, search, and observability suggestions are recorded in [the architecture guide](docs/architecture.md), with clear guidance on what belongs in a first app and what should remain optional.

## Why this helps

- **A whole application shape:** the acronym connects the browser, API, database, AI adapter, agents, retrieval, and object storage.
- **A smaller first step:** PostgreSQL, Hono, Next.js, and Bun are runnable here; Milvus, SeaweedFS, OpenClaw, identity, cache, and search are introduced only when a product needs them.
- **AI-friendly project context:** `AGENTS.md` and the docs tell coding agents how the repository is organized, what constraints to keep, and how to prove a change works.
- **Reproducible delivery:** the Bun lockfile, CI pipeline, security boundaries, and release checklist make verification part of the starter rather than an afterthought.
- **Replaceable model access:** application code talks to an adapter and configuration, so model and hosting choices can change without rewriting product logic.

This is a learning starter, not a finished product or a claim that one stack fits every workload. Teams still need to choose their identity provider, hosting, data retention, backup plan, and operational targets for each app.

## Start here

Prerequisites: [Bun 1.4.2](https://bun.sh/), Docker Compose, and Git. Use Bun commands for JavaScript tooling; do not substitute another JavaScript runtime or package manager.

```sh
git clone https://github.com/Curiosity-Corp/phantoms.git
cd phantoms
bun install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Open the web app at <http://localhost:3000>. The Hono API listens at <http://127.0.0.1:4000>; its health route is `/healthz` and its sample task API is under `/api/tasks`.

See [Getting started](docs/getting-started.md) for commands, troubleshooting, and the sample API. The credentials in `.env.example` are for a local disposable database only.

For a single-container production shape, `Dockerfile` builds the static web output and Hono API into a non-root Bun image. Supply `DATABASE_URL` and `API_BEARER_TOKEN` from the deployment secret manager and put the container behind TLS ingress; never bake real secrets into an image. The bearer token is a minimal starter gate, not a replacement for per-user identity and authorization.

## Verify changes

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun audit --audit-level high
bun test
bun run build
```

Merge requests run the core checks, PostgreSQL integration tests, and blocking source and dependency scans through GitLab CI. The protected default branch also builds and smoke-tests the container without publishing it. See [CI/CD](docs/ci-cd.md) for Launch Sequence and the public GitLab baseline.

## Recommended versions

The starter was refreshed on **2026-10-01**. Exact application package versions are pinned in `package.json` and `bun.lock`; [the version policy](docs/version-policy.md) records the current baseline and update cadence. Review security advisories and compatibility before each scheduled dependency update.

## Documentation

- [Agent instructions](AGENTS.md)
- [Architecture and optional services](docs/architecture.md)
- [Recommended supporting tools](docs/recommended-tooling.md)
- [Getting started](docs/getting-started.md)
- [AI integration](docs/ai.md)
- [Security practices](docs/security.md)
- [CI/CD and release flow](docs/ci-cd.md)
- [Version policy](docs/version-policy.md)
- [Architecture decisions](docs/decisions.md)
- [Contributing](CONTRIBUTING.md)

## License

Free to study, adapt, and build on under the [MIT License](LICENSE). Third-party services and packages retain their own terms.
