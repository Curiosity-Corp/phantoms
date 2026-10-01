# Version policy

**Baseline reviewed:** 2026-10-01. Exact app dependencies are in `package.json` and `bun.lock`. Optional infrastructure versions below are learning references; the corresponding services are not all installed or integration-tested by this starter.

## Application baseline

| Component | Version | Notes |
| --- | --- | --- |
| Bun | 1.4.2 | Required runtime and package manager; exact `packageManager` pin. |
| Turborepo | 2.11.6 | Local development dependency, not a floating CLI install. |
| Next.js | 16.3.8 | Active LTS patch line as of the review date; static output in this starter. |
| React / React DOM | 19.3.0 | Pinned with the web app. |
| `@types/node` | 26.6.3 | Type declarations required by the Next.js checker; not an executable runtime. |
| Hono | 4.13.12 | API framework; served through the Bun runtime's native HTTP server. |
| AI SDK | 7.0.126 | Provider interface in the server-side AI package. |
| PostgreSQL container | 18.6 | Local Compose only; production should pin an approved image digest. |

Official sources: [Bun releases](https://github.com/oven-sh/bun/releases), [Turborepo support policy](https://turborepo.dev/docs/support-policy), [Next.js September 2026 security release](https://nextjs.org/blog/september-2026-security-release), [Hono releases](https://github.com/honojs/hono/releases), [AI SDK releases](https://github.com/vercel/ai/releases), and [PostgreSQL versioning](https://www.postgresql.org/support/versioning/).

## Optional service reference pins

| Service | Reference version | Before adoption |
| --- | --- | --- |
| OpenClaw | `v2026.9.7` | Review the release, isolate the gateway, and configure per-agent tool permissions. |
| Milvus | `v3.0.2` | Verify object-store semantics, backups, query workload, and exact SeaweedFS compatibility. |
| SeaweedFS | `4.48` | Test S3 behavior, retention, access control, and recovery with the chosen client. |

Sources: [OpenClaw releases](https://github.com/openclaw/openclaw/releases), [Milvus release notes](https://milvus.io/docs/release_notes.md), and [SeaweedFS releases](https://github.com/seaweedfs/seaweedfs/releases).

## Update cadence

- Review security advisories weekly and update critical patches promptly.
- Run a monthly dependency and base-image refresh. Review changelogs, breaking changes, licensing, and compatibility before updating pins.
- Refresh Bun, framework, database, and deployment pins together only when local checks, CI, migration checks, and runtime smoke tests pass.
- Pin container digests for production promotions. Version tags alone do not make production artifacts immutable.
- Keep optional services out of the default local/CI path until their integration and restore procedures have tests.
