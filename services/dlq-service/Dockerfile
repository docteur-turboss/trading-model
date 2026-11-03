# =============================================================================
#  Dockerfile — dlq-service
#  Multi-stage: deps → build → runtime
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
WORKDIR /app/services/dlq-service
RUN bun run build

# Node runtime: Bun exposes neither the peer certificate on HTTPS request
# sockets nor server.setSecureContext, which SPIFFE mTLS (ADR-0011) relies on
# for caller identity and SVID rotation.
FROM node@sha256:6d2c7d5d074bf72f81ddc252b4fbb5d625bc028eeda49cb4b8c2ff8eda1ee617 AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/dlq-service/package.json ./services/dlq-service/
COPY --from=build /app/services/dlq-service/dist ./services/dlq-service/dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/dlq-service/dist/application/index.js"]