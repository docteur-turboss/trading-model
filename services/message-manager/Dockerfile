# =============================================================================
#  message-manager — Message Broker / Event Bus
#  Build context: monorepo root (.)
#  docker build -t trading-model/message-manager -f services/message-manager/Dockerfile .
# =============================================================================

FROM oven/bun@sha256:c1cc397e0be452c54f37cbcdfaa747eff93c993723af7d91658764d0fdfe5873 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
# --ignore-scripts: the root "prepare" script runs husky, a dev dependency absent here.
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun@sha256:c1cc397e0be452c54f37cbcdfaa747eff93c993723af7d91658764d0fdfe5873 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/message-manager
RUN bun run build

# Node runtime: Bun exposes neither the peer certificate on HTTPS request
# sockets nor server.setSecureContext, which SPIFFE mTLS (ADR-0011) relies on
# for caller identity and SVID rotation.
FROM node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

# Owned by appuser at copy time: a `chown -R /app` afterwards rewrites every
# file of node_modules into a second layer (twice the size, and a step slow
# enough to stall the build).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --chown=appuser:appgroup --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=build /app/packages ./packages
COPY --chown=appuser:appgroup --from=build /app/services/message-manager/package.json ./services/message-manager/
COPY --chown=appuser:appgroup --from=build /app/services/message-manager/dist ./services/message-manager/dist
RUN chown appuser:appgroup /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/message-manager/dist/application/index.js"]