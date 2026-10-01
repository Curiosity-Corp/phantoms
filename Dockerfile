ARG BUN_IMAGE=oven/bun:1.4.2-slim

FROM ${BUN_IMAGE} AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/db/package.json packages/db/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun --version \
  && bun run lint \
  && bun run typecheck \
  && bun run db:check \
  && bun test \
  && bun run build

FROM ${BUN_IMAGE} AS runtime
WORKDIR /app
ENV API_HOST=0.0.0.0 \
    API_PORT=4000 \
    SERVE_STATIC_WEB=1 \
    WEB_STATIC_ROOT=/app/apps/web/out

COPY --from=build --chown=bun:bun /app/apps/api/dist/server.js ./apps/api/dist/server.js
COPY --from=build --chown=bun:bun /app/apps/web/out ./apps/web/out

USER bun
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD bun -e 'fetch("http://127.0.0.1:4000/healthz").then((response) => { if (!response.ok) throw new Error("unhealthy"); })'
CMD ["bun", "run", "apps/api/dist/server.js"]
