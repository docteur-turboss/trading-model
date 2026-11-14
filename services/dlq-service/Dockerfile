# =============================================================================
#  Dockerfile — dlq-service
#  Multi-stage: deps → build → runtime
# =============================================================================

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
# --ignore-scripts: the root "prepare" script runs husky, a dev dependency absent here.
# Hoisted: the runtime stage only copies the root node_modules, and bun >= 1.3
# links workspaces in isolated mode (per-workspace node_modules) by default.
RUN bun install --frozen-lockfile --production --ignore-scripts --linker hoisted

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --linker hoisted
RUN bun run build
WORKDIR /app/services/dlq-service
RUN bun run build

# Node runtime: Bun exposes neither the peer certificate on HTTPS request
# sockets nor server.setSecureContext, which SPIFFE mTLS (ADR-0011) relies on
# for caller identity and SVID rotation.
FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94 AS runtime
WORKDIR /app
# npm/npx are unused at runtime; their bundled deps (undici, brace-expansion) trip the release scan (ADR-0038).
RUN apk add --no-cache tini curl && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/dlq-service/package.json ./services/dlq-service/
COPY --from=build /app/services/dlq-service/dist ./services/dlq-service/dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
ARG BUILD_VERSION=dev
ARG GIT_SHA=unknown
ENV BUILD_VERSION=$BUILD_VERSION GIT_SHA=$GIT_SHA
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/dlq-service/dist/application/index.js"]
