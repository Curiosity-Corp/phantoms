# Recommended supporting tools

The original PHANTOMS proposal included a practical set of UI, validation, identity, search, observability, and test tools. Treat this as a menu with boundaries, not a requirement to install everything. The base repository intentionally chooses only the tools needed to make its small example work.

## UI and frontend

| Tool | Recommendation |
| --- | --- |
| [shadcn/ui](https://ui.shadcn.com/) | A good choice when the app wants accessible primitives and owned component source. Review generated code and keep design tokens in the app. |
| [Tailwind CSS 4](https://tailwindcss.com/) | Useful for utility-driven styling and design systems. Add when the team prefers it; do not mix multiple styling systems without a reason. |
| [Motion](https://motion.dev/) | Add for interaction or transition needs; respect reduced-motion preferences and keep essential information visible without animation. |
| [Lucide](https://lucide.dev/) | A consistent icon set. Use accessible labels for meaningful icons. |
| [next-themes](https://github.com/pacocoursey/next-themes) | Add for theme switching after defining SSR/static behavior and a no-flash default. |

The starter uses plain CSS to keep its first build easy to inspect.

## Language and validation

| Tool | Recommendation |
| --- | --- |
| [TypeScript](https://www.typescriptlang.org/) | Use strict mode at app and package boundaries. Keep external data typed as `unknown` until validated. |
| [Zod](https://zod.dev/) | Use for environment configuration, API input, and structured output validation. The starter demonstrates API payload validation. |
| [Biome](https://biomejs.dev/) | One formatter/linter for this starter. Keep its CI check non-mutating; use a local write command only when intentionally formatting. |
| [Drizzle ORM](https://orm.drizzle.team/) | Type-safe SQL-oriented access and reviewed schema migrations. Keep the generated SQL in version control. |
| [Redis](https://redis.io/) | Add for measured cache, queue, or coordination needs. Define TTL, eviction, idempotency, and recovery behavior first. |

The repo uses Bun's built-in test runner to keep the default toolchain small. Use [Playwright](https://playwright.dev/) for deterministic browser flows when the application has user journeys worth protecting; run those tests in a browser-capable CI job.

## Identity and user-facing search

| Tool | Recommendation |
| --- | --- |
| [Keycloak](https://www.keycloak.org/) | A self-managed identity option for OIDC and SSO. Also evaluate managed identity providers; the app still must authorize each operation and tenant. |
| [Meilisearch](https://www.meilisearch.com/) | A user-facing search option for typo tolerance, facets, and interactive search. Keep the source of truth in PostgreSQL and define index update/deletion behavior. |

Identity and search are not configured in this starter because the right realm, tenant model, and index policy depend on the app.

## Observability

- Emit structured, redacted logs with request IDs.
- Define latency, error, saturation, and availability signals for the service's actual SLOs.
- Use OpenTelemetry protocol where runtime instrumentation is proven for the selected Bun and library versions.
- Grafana, Mimir, Tempo, and Loki can provide dashboards, metrics, traces, and log aggregation for teams operating that stack. A managed observability service can be a better fit for a small app.
- Avoid logging prompts, responses, credentials, session tokens, or personal data by default.

The original proposal named [Grafana Mimir](https://grafana.com/oss/mimir/), [Grafana Tempo](https://grafana.com/oss/tempo/), and [Grafana Loki](https://grafana.com/oss/loki/) for those roles. These services are optional and not deployed by this starter.
