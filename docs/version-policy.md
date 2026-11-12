# Version policy

**Baseline reviewed:** 2026-11-03. Exact app dependencies are in `package.json` and `bun.lock`. Optional infrastructure versions below are learning references; the corresponding services are not all installed or integration-tested by this starter.

## Application baseline

| Component | Version | Notes |
| --- | --- | --- |
| Bun | 1.4.4 | Required runtime and package manager; exact `packageManager` pin. |
| Turborepo | 2.11.10 | Local development dependency, not a floating CLI install. |
| Next.js | 16.4.5 | Active LTS line as of the review date; static output in this starter. |
| React / React DOM | 19.3.1 | Pinned with the web app. |
| `@types/node` | 26.6.6 | Type declarations required by the Next.js checker; not an executable runtime. |
| Hono | 4.13.16 | API framework; served through the Bun runtime's native HTTP server. |
| AI SDK | 7.0.162 | Provider interface in the server-side AI package. |
| Biome | 2.6.4 | Lint and format for code and JSON. Markdown and YAML are excluded in `biome.json` so docs are not reformatted by a tool upgrade. |
| Drizzle ORM | 0.45.4 | Query builder and migration tool in `packages/db` (Drizzle Kit 0.31.11). |
| postgres.js | 4.0.0 | PostgreSQL driver, a new major version taken in this refresh. The database integration job in CI runs against a real PostgreSQL service. |
| Playwright | 1.64.1 | `@playwright/test` for `bun run test:e2e`. CI uses the matching `mcr.microsoft.com/playwright:v1.64.1-noble` image; `PLAYWRIGHT_VERSION` in `.gitlab-ci.yml` must equal this version. |
| `@hono/otel` | 1.2.0 | Per-request server spans for Hono; opt-in, see recommended-tooling.md. |
| OpenTelemetry JS | API 1.9.1; SDK packages 2.12.0; OTLP exporter 0.223.0 | Trace packages only, on the 2.x line (all published at least two weeks before 2026-11-03). The API stays below 1.10 because the 0.223 packages declare `<1.10`. The 3.0 major line, released 2026-10-20 (about two weeks old), is deliberately not taken yet; `@hono/otel` 1.3.0 (2026-10-27) is also newer than two weeks. |
| PostgreSQL container | 18.6 | Local Compose only; production should pin an approved image digest. |

Official sources, opened on 2026-11-03: [Bun releases](https://github.com/oven-sh/bun/releases), [Turborepo support policy](https://turborepo.dev/docs/support-policy), [Next.js September 2026 security release](https://nextjs.org/blog/september-2026-security-release), [Hono releases](https://github.com/honojs/hono/releases), [Next.js support policy](https://nextjs.org/support-policy), [AI SDK releases](https://github.com/vercel/ai/releases), [Biome](https://github.com/biomejs/biome/releases), [Drizzle](https://github.com/drizzle-team/drizzle-orm/releases), [Playwright releases](https://github.com/microsoft/playwright/releases), [OpenTelemetry JS releases](https://github.com/open-telemetry/opentelemetry-js/releases), [`@hono/otel`](https://www.npmjs.com/package/@hono/otel), and [PostgreSQL versioning](https://www.postgresql.org/support/versioning/).

## Optional service reference pins

| Service | Reference version | Before adoption |
| --- | --- | --- |
| OpenClaw | `v2026.10.10` | Fast-moving: review its published security advisories before each pin bump. Review the release, isolate the gateway, and configure per-agent tool permissions. |
| Milvus | `v3.0.5` | Verify object-store semantics, backups, query workload, and exact SeaweedFS compatibility. |
| SeaweedFS | `4.52` | Test S3 behavior, retention, access control, and recovery with the chosen client. |

Sources: [OpenClaw releases](https://github.com/openclaw/openclaw/releases), [Milvus release notes](https://milvus.io/docs/release_notes.md), and [SeaweedFS releases](https://github.com/seaweedfs/seaweedfs/releases).

## Update cadence

- Review security advisories weekly and update critical patches promptly.
- Run a monthly dependency and base-image refresh. Review changelogs, breaking changes, licensing, and compatibility before updating pins.
- Refresh Bun, framework, database, and deployment pins together only when local checks, CI, migration checks, and runtime smoke tests pass.
- Pin container digests for production promotions. Version tags alone do not make production artifacts immutable.
- Keep optional services out of the default local/CI path until their integration and restore procedures have tests.

## Last reviewed

Each component was last checked against its official release source on the date shown. The verdict and the reason are in [the architecture decisions](decisions.md). This table is updated whenever a component is reviewed; it is separate from the version tables above so a version bump does not hide when the verdict was last confirmed.

| Component | Last reviewed | Verdict and decision |
| --- | --- | --- |
| Bun runtime | 2026-11-03 | Keep (001, no-change table) |
| Turborepo | 2026-11-03 | Keep, justified (006) |
| Next.js and React | 2026-11-03 | Keep, static export (004, no-change table) |
| Hono | 2026-11-03 | Keep (no-change table) |
| TypeScript | 2026-11-03 | Keep 7.0.2 (no-change table) |
| Biome | 2026-11-03 | Keep, 2.6.x (no-change table) |
| Zod | 2026-11-03 | Keep (008) |
| Drizzle ORM | 2026-11-03 | Keep 0.45.x (007) |
| AI SDK and adapter | 2026-11-03 | Keep and extend (011) |
| PostgreSQL | 2026-11-03 | Keep, local Compose only (003) |
| OpenClaw | 2026-11-03 | Keep optional (no-change table) |
| Milvus | 2026-11-03 | Keep optional (no-change table) |
| SeaweedFS | 2026-11-03 | Keep optional (no-change table) |
| Redis or Valkey | 2026-11-03 | Optional, both named (009) |
| Keycloak | 2026-11-03 | Self-hosted OIDC example (010) |
