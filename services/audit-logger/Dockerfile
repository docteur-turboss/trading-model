# =============================================================================
#  Dockerfile — audit-logger
#  Multi-stage: deps → build → runtime
# =============================================================================

# ── Stage 1: Install production dependencies ────────────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --production

# ── Stage 2: Build shared packages + service ────────────────────────────────
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/audit-logger
RUN bun run build

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/audit-logger/package.json ./services/audit-logger/
COPY --from=build /app/services/audit-logger/dist ./services/audit-logger/dist

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/ping || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/audit-logger/dist/application/index.js"]