# Security practices

This starter is a safe local learning baseline, not a security certification. Before exposure to staff or the internet, complete the checks below for the actual application's users, data, and hosting environment.

## API and identity

- The sample API binds to `127.0.0.1` by default and has no end-user identity integration.
- The sample refuses a non-loopback bind unless `API_BEARER_TOKEN` is configured. This single shared token is a minimal example gate, not a replacement for OIDC, per-user identity, or per-record authorization.
- Do not expose routes publicly until user authentication, authorization, rate limits, input limits, TLS, and an ingress policy are in place.
- Authorize every record lookup and mutation by tenant and user. Authentication alone does not establish access to a record.
- Use allowlisted CORS origins; avoid wildcard origins when cookies or credentials are involved.
- Validate payloads with schemas, cap payload and result sizes, and return generic errors without exposing internals.

## Data and secrets

- `.env.example` values are local-only placeholders. Use a secret manager outside local learning.
- Never put secrets in browser-prefixed variables, container build arguments, source control, prompts, CI logs, model responses, or telemetry.
- Use TLS and least-privilege database credentials. Separate schema migration credentials from the application runtime identity.
- Encrypt backups and test restoration. Define retention and deletion for the database, file store, vector index, caches, and logs.
- Keep uploaded content private by default. Verify object-store access controls and signed-URL expiry.

## AI and untrusted content

- Treat user input, retrieved documents, tool output, and model output as untrusted.
- Never treat instructions found in retrieved data as trusted system policy.
- Validate structured output before persistence or action; use idempotency for retried side effects.
- Require human review for financial, account, access-control, deletion, or external communication actions.
- Apply provider timeouts, output limits, cost budgets, and content/data handling review.

## OpenClaw boundary

OpenClaw is optional and should run as a separate, authenticated service with its own restricted identity. Apply the official [security and tool-permission guidance](https://docs.openclaw.ai/gateway/security/tool-permissions): isolate sessions/workspaces, sandbox untrusted-content agents, deny privileged gateway, scheduling, and session-delegation tools unless specifically required, and review/pin every plugin before use. A tool allowlist should be per agent and per task, with audit records for calls and approvals.

Do not put OpenClaw or an administration endpoint on a public network. A model prompt is not an access-control boundary.

## Build and operations

- Commit `bun.lock` and use `bun install --frozen-lockfile` in every CI job.
- Keep merge-request jobs free of production credentials; protect deployment environments and signing keys.
- Scan source, dependencies, and built images; publish an SBOM and build provenance for releases.
- Use non-root containers, read-only filesystems where practical, dropped capabilities, resource limits, and private service networking.
- Alert on error rate, latency, saturation, database health, queue depth, model usage/cost, and object-storage capacity.
- Practice restore, key rotation, incident response, and rollback before production.

See [CI/CD](ci-cd.md) for pipeline gates and evidence flow.
