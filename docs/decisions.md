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

## 007 — pgvector first; Milvus and SeaweedFS as tested optional profiles

**Date:** 2026-11-04
**Decision:** Document pgvector in the existing PostgreSQL as the first retrieval step, with its own migrations, one table and a cosine-similarity query. Offer Milvus 3 and SeaweedFS as Compose profiles (`retrieval`, `objects`) that are off by default, and prove them with an opt-in integration test that CI runs on a schedule.
**Reason:** pgvector adds no service and keeps chunks, source records, authorization and backups in one database. Milvus is a better fit once a measured need (scale, latency, hybrid search, independent scaling) outgrows it. No official Milvus 3 and SeaweedFS compatibility statement was found, so the pairing is tested rather than assumed: object write/read, vector insert/search, and Milvus segment files landing in SeaweedFS.
**Choices:** SeaweedFS (Apache-2.0, active) rather than MinIO, whose repository was archived on 2026-04-24; the S3 API keeps the client portable, and RustFS is an untested alternative. Versions are the newest whose images were at least two weeks old on the check date, not the newest releases (see `version-policy.md`). pgvector is pinned to the 0.8.6 image; the starter uses HNSW, so the IVFFlat fix in 0.8.7 does not apply to it. The default migrations never need pgvector; the vector migrations are separate.
**Tradeoff:** The optional stack adds a second Compose database, three more services and a CI job that needs more runner memory. The tested backup procedure is a cold volume copy with downtime; production needs an online method (see `retrieval.md`). Decision 003 still holds: nothing here is in the default path.
