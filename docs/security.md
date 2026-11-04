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

## Agent runtime boundary

An agent runtime (OpenClaw is one example; see [Agent runtime options](architecture.md#agent-runtime-options)) is a separate deployment with its own identity. The app never embeds it and never trusts it more than any other client. Whatever the runtime, the controls on the app side are the same:

- Give the runtime its own credential, separate from every user's and from the database's. Store it in a secret manager, rotate it, and revoke it without touching anyone else's access.
- Expose a narrow surface: a few authenticated API routes and/or an MCP server with a short tool list. Read-only tools by default; add a tool that changes data only with a recorded decision and a human approval step for consequential actions.
- Authorize and rate-limit every call inside the app. The runtime's own settings, and the model's prompt, are not access-control boundaries.
- Treat tool results as untrusted text. A task title or a document can contain instructions aimed at the model that reads it.
- Keep audit records of tool calls and approvals, without logging the credential or full content.
- Run the runtime on a private network. Do not put it, or an administration endpoint, on the public internet, and do not give it a route to the database.

### The MCP example

`apps/mcp` shows this surface in small form: two read-only tools over MCP's streamable HTTP transport, a mandatory bearer token from `MCP_BEARER_TOKEN` (at least 32 characters, compared in constant time), requests carrying a browser `Origin` refused unless listed, a request body limit, and no sessions. It binds to loopback by default and is not part of the default Compose file, `bun run dev` or the container image. Like the sample API token, one shared token is an example gate, not per-user identity: for real use, issue one credential per runtime and authorize per user or tenant inside the tools.

### If you run OpenClaw

OpenClaw is a Node application that connects chat channels to an assistant through a Gateway. Its [README](https://github.com/openclaw/openclaw#security) says tools run on the host for the main session unless sandboxing is configured, and tells operators to read its security guide, exposure runbook and sandboxing guide before connecting other users or exposing the Gateway remotely.

- Follow OpenClaw's [tool and agent permissions guidance](https://docs.openclaw.ai/gateway/security/tool-permissions): for any agent or surface that handles untrusted content, deny the `gateway`, `cron`, `sessions_spawn` and `sessions_send` tools by default, and give different agents different access profiles. Its guidance also notes that agents with message-tool access can send across conversations and providers by default, so decide deliberately whether to turn that off.
- Isolate sessions and workspaces, sandbox agents that read untrusted content, and review and pin every plugin before use. A tool allowlist should be per agent and per task, with audit records for calls and approvals.
- Read the [published security advisories](https://github.com/openclaw/openclaw/security/advisories) before choosing a version and before each upgrade. On 2026-11-04 the page listed 722 published advisories, the most recent published on 2026-09-11, so check which ones affect the version you run and whether the fix is in the version you move to. Report a vulnerability through the project's [security policy](https://github.com/openclaw/openclaw/blob/main/SECURITY.md).
- Give it an app credential that can reach only the narrow surface above. Do not hand it the app's secrets, a database connection string or a broad service account.

## Build and operations

- Commit `bun.lock` and use `bun install --frozen-lockfile` in every CI job.
- Keep merge-request jobs free of production credentials; protect deployment environments and signing keys.
- Scan source, dependencies, and built images; publish an SBOM and build provenance for releases.
- Use non-root containers, read-only filesystems where practical, dropped capabilities, resource limits, and private service networking.
- Alert on error rate, latency, saturation, database health, queue depth, model usage/cost, and object-storage capacity.
- Practice restore, key rotation, incident response, and rollback before production.

See [CI/CD](ci-cd.md) for pipeline gates and evidence flow.
