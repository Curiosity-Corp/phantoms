# Architecture decisions

This small decision log records choices that coding agents should not reverse casually.

## 001 — Bun is the required JavaScript runtime

**Date:** 2026-10-01
**Decision:** Use a pinned Bun release for install, scripts, development, and the Hono service. Commit the text lockfile and use frozen installs.
**Reason:** Bun is an explicit PHANTOMS preference and gives the learning starter one consistent toolchain.
**Tradeoff:** Some ecosystem packages document a different runtime as their supported server environment. Verify each selected package and hosting path under the pinned Bun release. This starter keeps the Next.js production output static and uses Bun for the build, avoiding an unverified framework server runtime in production.

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

## 006 — Observability and browser tests are small, opt-in and pinned

**Date:** 2026-11-03
**Decision:** The API writes redacted JSON logs with a request ID on every response. OpenTelemetry trace export is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and uses `@hono/otel` with the lean trace packages instead of `@opentelemetry/sdk-node`. `bun test` stays the unit and integration runner (Vitest is not added). Browser journeys use Playwright, run through `bun run test:e2e` against the built static app served with an in-memory task store, and CI runs them in a pinned `mcr.microsoft.com/playwright` image whose tag equals the `@playwright/test` version.
**Reason:** One runner and few dependencies keep the starter inspectable. Tests that need no database, model provider or network run anywhere. A pinned image avoids downloading browsers on every CI run and keeps browser and library in step. New packages were pinned at releases at least two weeks old on the review date, staying on the OpenTelemetry 2.x line rather than the just-released 3.0 major.
**Tradeoff:** Playwright's runner is started with `bun run --bun`; Playwright documents Node as its supported runtime, so this is verified here under the pinned Bun release and must be re-checked on each Bun or Playwright bump. The Playwright image also contains a Node binary and the job installs Bun from the npm registry into it; neither is part of the app or the deployment image. The e2e task journey calls the API from the page because the starter has no task screen. Only traces are exported; metrics and OTLP logs are not.
