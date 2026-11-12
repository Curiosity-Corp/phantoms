# Architecture decisions

This small decision log records choices that coding agents should not reverse casually.

## 001 — Bun is the required JavaScript runtime

**Date:** 2026-10-01
**Decision:** Use a pinned Bun release for install, scripts, development, and the Hono service across the app workspace, CI, and the deployment image. Commit the text lockfile and use frozen installs. A separately deployed optional service, such as OpenClaw (a Node application), may use its own runtime outside the workspace and the image.
**Reason:** Bun is an explicit PHANTOMS preference and gives the learning starter one consistent toolchain.
**Tradeoff:** Some ecosystem packages document a different runtime as their supported server environment, and optional services bring their own. Verify each selected package and hosting path under the pinned Bun release. This starter keeps the Next.js production output static and uses Bun for the build, avoiding an unverified framework server runtime in production.

The web package includes the framework's `@types/node` declarations solely because its TypeScript checker requires those type definitions. That package is not an executable runtime dependency; all scripts, API execution, and CI jobs use Bun.

## 002 — AI is provider-neutral

**Date:** 2026-10-01
**Decision:** Use a replaceable AI adapter with server-side endpoint, key, and model configuration.
**Reason:** Provider and model choices change and may differ by product, region, privacy requirement, or cost.
**Tradeoff:** Provider-specific capabilities still need explicit adapter handling and product evaluation.

## 003 — Stateful PHANTOMS services are opt-in

**Date:** 2026-10-01
**Decision:** Run PostgreSQL in local Compose; document Milvus, SeaweedFS, OpenClaw, Redis, identity, and search as optional layers.
**Reason:** The first-run experience should remain lightweight, while a real app can add services when justified.
**Tradeoff:** The optional service combinations require additional integration, resilience, and restore testing before use.

## 004 — Static Next.js output is the starter deployment default

**Date:** 2026-10-01
**Decision:** Use the Next.js App Router and export static assets. Serve dynamic API behavior from Hono on Bun.
**Reason:** The current Next.js system requirements document a Node.js server target; this starter must keep Bun as its only runtime. Static output keeps that boundary clear.
**Tradeoff:** Server Components requiring request-time work, Server Actions, and other server-only features are not available in the default deployment. If a team needs them, it must validate the chosen Next.js release and hosting adapter under Bun before adopting that path.

## 005 — GitLab is CI/CD source; public GitHub is a mirror

**Date:** 2026-10-01
**Decision:** Internal source and CI use GitLab. The approved repository content is mirrored to the public GitHub learning surface.
**Reason:** Internal CI can consume the private Launch Sequence; public readers receive a portable fallback pipeline.
**Tradeoff:** Public users cannot fetch the internal pipeline include and must use the fallback documented in `ci-cd.md`.

## Review of 2026-11-03

Decisions 006 to 011 and the table after them come from a review of every letter and supporting tool against current releases, done on 2026-11-03. Each entry records the evidence that was read that day. A version number is a fact about that day, not a promise: `package.json`, `bun.lock` and [the version policy](version-policy.md) hold the pins.

## 006 — Turborepo stays, with a documented fallback

**Date:** 2026-11-03 (review date)
**Decision:** Keep Turborepo as the task runner (`turbo` 2.11.10, published 2026-10-20 per the npm registry; [releases](https://github.com/vercel/turborepo/releases), [support policy](https://turborepo.dev/docs/support-policy)).
**Reason:** It gives learners one visible task graph (`build` and `typecheck` depend on `^build` and `^typecheck`, see `turbo.json`), cached outputs in CI, and the same mental model they will meet in larger monorepos. That teaching value is the reason, not speed.
**Tradeoff:** The workspace has four packages (`apps/api`, `apps/web`, `packages/ai`, `packages/db`), so the cache gain is small and Turborepo is one more dependency. If it becomes a burden, the fallback is plain Bun workspaces: `bun run --filter <workspace> <script>` (already used by the `db:*` scripts; see [`bun --filter`](https://bun.com/docs/pm/filter)) plus an explicit script order. Replacing it needs a superseding decision.
**Revisit when:** the workspace stays at four or fewer packages and a Turborepo major release needs migration work, or CI cache hits stop saving measurable time.

## 007 — Drizzle ORM stays on the 0.45 line until 1.0 is stable

**Date:** 2026-11-03 (review date)
**Decision:** Keep `drizzle-orm` on 0.45.x (`latest` is 0.45.4, published 2026-10-08).
**Reason:** `latest` on the npm registry still points to 0.45.4. Version 1.0 exists only as pre-release tags on the same registry page: `1.0.0-rc.5` under `rc` and `1.0.0-beta.22` under `beta` (both published 2026-10-21). A starter that learners copy should pin the stable line. Source: [drizzle-orm on npm](https://www.npmjs.com/package/drizzle-orm), [releases](https://github.com/drizzle-team/drizzle-orm/releases).
**Tradeoff:** Moving to 1.0 later means a migration of schema, query and migration-tool code, and reading its migration notes. Taking a release candidate now would save that work but would teach an API that may still change.
**Revisit when:** the `latest` dist-tag of `drizzle-orm` becomes 1.0.x. Plan the move through the `db:check` and database-integration checks.

## 008 — Zod is the schema library; Standard Schema is the exit

**Date:** 2026-11-03 (review date)
**Decision:** Keep Zod (4.6.7, published 2026-10-12) for environment, API input and structured model output. Do not add `@hono/standard-validator` (0.4.1, published 2026-10-26; peers `hono >=4.11.2` and `@standard-schema/spec ^1.0.0`) yet. Routes keep validating with `schema.safeParse` as in `apps/api/src/app.ts`.
**Reason:** One schema library keeps the starter small. Zod 4.6.7 ships Standard Schema typings (`zod/v4/core/standard-schema.d.ts` in the installed package, checked 2026-11-03), so code that validates through the [Standard Schema](https://standardschema.dev) interface can use another library later without the API depending on Zod types.
**Tradeoff:** Without the middleware, each route repeats a few lines of parse-and-respond code, and Zod is still named in route code. Adding `@hono/standard-validator` would remove that repetition and the Zod coupling at the cost of one more pinned dependency.
**Revisit when:** a second schema library is adopted, or route handlers repeat the parse-and-respond code more than a handful of times.

## 009 — Redis stays optional; Valkey is named as the permissively licensed alternative

**Date:** 2026-11-03 (review date)
**Decision:** Keep a cache or queue service optional (see 003) and name both Redis and Valkey in the docs. Neither is configured in this starter.
**Reason:** Both are current: Redis 8.10.3 (2026-10-26, [releases](https://github.com/redis/redis/releases)) and Valkey 9.1.3 (2026-10-26, [releases](https://github.com/valkey-io/valkey/releases)). Redis 8 is offered under a choice of RSALv2, SSPLv1 or AGPLv3 (read from the Redis repository's `LICENSE.txt` on 2026-11-03); Valkey is BSD-3-Clause ([valkey.io](https://valkey.io), GitHub license metadata). A team's licence review may decide the choice.
**Tradeoff:** Valkey is a fork, so a Redis feature added after the split may not exist there, and the reverse. Check the commands and modules the app uses against the chosen server and client library before relying on either. This is not legal advice; the team confirms the licence terms for its own use.
**Revisit when:** a feature actually needs a cache, queue or lock, or either project changes its licence.

## 010 — Keycloak remains the self-hosted OIDC example; identity is a per-app choice

**Date:** 2026-11-03 (review date)
**Decision:** Keep Keycloak as the self-hosted OpenID Connect and SSO example in the docs (26.8.1, 2026-10-13, [releases](https://github.com/keycloak/keycloak/releases); it documents support for OpenID Connect, OAuth 2.0 and SAML on [keycloak.org](https://www.keycloak.org/)). Do not add identity to the starter. Managed identity providers remain equally valid.
**Reason:** The right realm, tenant model and hosting depend on the product. The sample's single bearer token is a gate for local learning, not user identity (see [Security](security.md)).
**Tradeoff:** Self-hosting Keycloak means operating, patching and backing up another stateful service. A managed provider trades that for a vendor relationship and data-residency review. Application-level sessions for a web variant are a separate decision.
**Revisit when:** the web variant (variant-family issue #11) defines its session model, or an app built from the starter needs per-user authorisation.

## 011 — The AI layer stays a thin adapter on the AI SDK, and gains agentic seams

**Date:** 2026-11-03 (review date)
**Decision:** Keep the adapter in `packages/ai` built on the Vercel AI SDK (`ai` 7.0.162, published 2026-11-03) with the OpenAI-compatible provider as the provider-neutral default, and extend it with structured output, tool use, an optional MCP client (`@ai-sdk/mcp` 2.0.90, same day; MCP specification revision 2026-07-28, [release](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28)), budgets and a fake adapter. The implementation work is tracked in issue #7. First-party providers (for example a `@ai-sdk/<provider>` package) are optional adapters behind the same interface; none is a default.
**Reason:** The adapter is the replaceable seam that decision 002 requires. Agent frameworks such as `@mastra/core` (1.82.0) and `@openai/agents` (0.21.0) bring their own lifecycle and release cadence; they are options for an app that needs them, not part of the starter.
**Tradeoff:** The starter owns a small amount of glue code instead of adopting a framework, and must track AI SDK major versions. In return, a learner can read all of it.
**Revisit when:** the AI SDK ships a new major version, or the starter needs durable multi-step workflows that a thin adapter cannot express.

## No-change verdicts from the 2026-11-03 review

Each row below was checked on 2026-11-03 and needs no new decision. "Revisit when" is the trigger to review it again.

| Choice | Verdict | Evidence | Revisit when |
| --- | --- | --- | --- |
| Bun runtime and package manager (decision 001) | Keep | Bun 1.4.4 is the latest release ([releases](https://github.com/oven-sh/bun/releases), 2026-10-22). Bun's own [Next.js guide](https://bun.com/docs/guides/ecosystem/nextjs) runs `bun --bun next dev`, `build` and `start`, while Next.js documents a Node.js server as the minimum platform ([deploying to platforms](https://nextjs.org/docs/app/guides/deploying-to-platforms)), so the static export in decision 004 stays the safe default. | A Next.js release documents Bun as a supported server runtime, or a pinned package breaks under Bun. |
| Hono | Keep | 4.13.16 is `latest` (2026-11-01); 5.0 exists only as `5.0.0-rc.1` under the `next` tag ([npm](https://www.npmjs.com/package/hono)). | Hono 5 is `latest`. |
| Next.js with static export (decision 004) | Keep | 16.x is Active LTS, 15.x is Maintenance LTS with security releases through 2027-01-31 ([support policy](https://nextjs.org/support-policy)); `latest` is 16.4.5. | Next.js 17 is released, or a team needs server-only features (see 004). |
| Biome | Keep, on 2.6.x | `latest` is 2.6.4, published 2026-10-28 ([releases](https://github.com/biomejs/biome/releases)). The bump from 2.5.15 is made in the dependency-refresh merge request, not here. | A Biome major release, or a rule the team needs that Biome lacks. |
| TypeScript | Keep 7.0.2 | The native-compiler line is released as 7.0.2 ([release](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2)) and is already the repository's pin. | A newer 7.x release passes `bun run typecheck` and the web build. |
| OpenClaw (O) | Keep optional | v2026.10.10 is the latest release ([releases](https://github.com/openclaw/openclaw/releases), 2026-11-03), MIT licence. It is fast-moving; its role and requirements are reframed in issue #8. | Issue #8 lands, or a security advisory affects the pinned release. |
| Milvus (M) | Keep optional | v3.0.5 is the latest release ([releases](https://github.com/milvus-io/milvus/releases), 2026-10-30). A PostgreSQL-first retrieval step (pgvector) is planned in issue #9 and is not decided here. | Issue #9 lands, or an app has a retrieval workload that PostgreSQL cannot serve. |
| SeaweedFS (S) | Keep optional | 4.52 is the latest release ([releases](https://github.com/seaweedfs/seaweedfs/releases), 2026-11-02), Apache-2.0, actively pushed. MinIO's repository is [archived and read-only](https://github.com/minio/minio) (the GitHub banner reads 25 April 2026), which supports a non-MinIO default. | An app needs object storage, at which point S3 behaviour is tested with the chosen client. |

## 012 — Observability and browser tests are small, opt-in and pinned

**Date:** 2026-11-03
**Decision:** The API writes redacted JSON logs with a request ID on every response. OpenTelemetry trace export is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and uses `@hono/otel` with the lean trace packages instead of `@opentelemetry/sdk-node`. `bun test` stays the unit and integration runner (Vitest is not added). Browser journeys use Playwright, run through `bun run test:e2e` against the built static app served with an in-memory task store, and CI runs them in a pinned `mcr.microsoft.com/playwright` image whose tag equals the `@playwright/test` version.
**Reason:** One runner and few dependencies keep the starter inspectable. Tests that need no database, model provider or network run anywhere. A pinned image avoids downloading browsers on every CI run and keeps browser and library in step. New packages were pinned at releases at least two weeks old on the review date, staying on the OpenTelemetry 2.x line rather than the just-released 3.0 major.
**Tradeoff:** Playwright's runner is started with `bun run --bun`; Playwright documents Node as its supported runtime, so this is verified here under the pinned Bun release and must be re-checked on each Bun or Playwright bump. The Playwright image also contains a Node binary and the job installs Bun from the npm registry into it; neither is part of the app or the deployment image. The e2e task journey calls the API from the page because the starter has no task screen. Only traces are exported; metrics and OTLP logs are not.

## Superseding a decision

An entry in this log is not edited to change its outcome. To reverse or replace one, add a new entry that names the one it supersedes, give its date, evidence and "revisit when" trigger, and mark the old entry with a one-line "Superseded by NNN" note. Coding agents must not reverse a decision without such an entry.
