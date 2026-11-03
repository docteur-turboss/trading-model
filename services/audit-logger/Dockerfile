# =============================================================================
#  Dockerfile — audit-logger
#  Multi-stage: deps → build → runtime
# =============================================================================

# ── Stage 1: Install production dependencies ────────────────────────────────
FROM oven/bun@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
# --ignore-scripts: the root "prepare" script runs husky, a dev dependency absent here.
RUN bun install --frozen-lockfile --production --ignore-scripts

# ── Stage 2: Build shared packages + service ────────────────────────────────
FROM oven/bun@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/audit-logger
RUN bun run build

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
# Node runtime: Bun exposes neither the peer certificate on HTTPS request
# sockets nor server.setSecureContext, which SPIFFE mTLS (ADR-0011) relies on
# for caller identity and SVID rotation.
FROM node@sha256:6d2c7d5d074bf72f81ddc252b4fbb5d625bc028eeda49cb4b8c2ff8eda1ee617 AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

# Owned by appuser at copy time: a `chown -R /app` afterwards rewrites every
# file of node_modules into a second layer (twice the size, and a step slow
# enough to stall the build).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --chown=appuser:appgroup --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=build /app/packages ./packages
COPY --chown=appuser:appgroup --from=build /app/services/audit-logger/package.json ./services/audit-logger/
COPY --chown=appuser:appgroup --from=build /app/services/audit-logger/dist ./services/audit-logger/dist
RUN chown appuser:appgroup /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/audit-logger/dist/application/index.js"]