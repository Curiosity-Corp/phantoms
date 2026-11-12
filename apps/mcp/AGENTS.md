# apps/mcp: optional read-only MCP server

Applies to this folder only. The root `AGENTS.md` still applies.

- This is an example for attaching an agent harness (OpenClaw or any MCP client) to the app. It is not part of `bun run dev`, `compose.yaml` or the container image. Keep it that way: no `dev` or `build` script here.
- Exactly two tools, `list_tasks` and `get_task`, both read-only. Do not add a tool that creates, changes, deletes or sends anything without a decision in `docs/decisions.md` and a human-approval step.
- Tools reach data only through the `TaskReader` passed to `createTaskServer` (`src/tools.ts`). Never import `postgres` or `drizzle-orm` here.
- Every request needs `Authorization: Bearer <MCP_BEARER_TOKEN>`. Compare with `tokenMatches` (constant time), never `===`. Do not log the token or the header.
- Task titles come from users. Tool results are untrusted text to the calling model; never present them as instructions.
- Stateless on purpose: a new server per request, no sessions. Bind to `127.0.0.1` unless TLS and network policy are in place.
- Tests: `bun test apps/mcp/test/mcp.test.ts` needs no database or network beyond loopback.
- Check your work: `bun run lint && bun run typecheck && bun test`.
