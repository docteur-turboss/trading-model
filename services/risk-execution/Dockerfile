# =============================================================================
#  Dockerfile — risk-execution
#  Multi-stage: deps → build → runtime
# =============================================================================

# ── Stage 1: Install production dependencies ────────────────────────────────
FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
# --ignore-scripts: the root "prepare" script runs husky, a dev dependency absent here.
# Hoisted: the runtime stage only copies the root node_modules, and bun >= 1.3
# links workspaces in isolated mode (per-workspace node_modules) by default.
RUN bun install --frozen-lockfile --production --ignore-scripts --linker hoisted

# ── Stage 2: Build shared packages + service ────────────────────────────────
FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --linker hoisted
RUN bun run build
WORKDIR /app/services/risk-execution
RUN bun run build

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
# Node runtime: Bun exposes neither the peer certificate on HTTPS request
# sockets nor server.setSecureContext, which SPIFFE mTLS (ADR-0011) relies on
# for caller identity and SVID rotation.
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runtime
WORKDIR /app
# npm/npx are unused at runtime; their bundled deps (undici, brace-expansion) trip the release scan (ADR-0038).
RUN apk add --no-cache tini curl && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Owned by appuser at copy time: a `chown -R /app` afterwards rewrites every
# file of node_modules into a second layer (twice the size, and a step slow
# enough to stall the build).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --chown=appuser:appgroup --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=build /app/packages ./packages
COPY --chown=appuser:appgroup --from=build /app/services/risk-execution/package.json ./services/risk-execution/
COPY --chown=appuser:appgroup --from=build /app/services/risk-execution/dist ./services/risk-execution/dist
RUN chown appuser:appgroup /app
# A named volume copies the owner of its mount point: without this, compose mounts /data/risk-execution root-owned (EACCES on mkdir).
RUN mkdir -p /data/risk-execution && chown appuser:appgroup /data/risk-execution
ARG BUILD_VERSION=dev
ARG GIT_SHA=unknown
ENV BUILD_VERSION=$BUILD_VERSION GIT_SHA=$GIT_SHA
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/risk-execution/dist/application/index.js"]
