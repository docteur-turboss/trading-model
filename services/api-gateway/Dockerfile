# =============================================================================
#  Dockerfile — api-gateway
#  Multi-stage: deps → build → runtime
# =============================================================================

# ── Stage 1: Install production dependencies ────────────────────────────────
FROM oven/bun@sha256:c1cc397e0be452c54f37cbcdfaa747eff93c993723af7d91658764d0fdfe5873 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --production

# ── Stage 2: Build shared packages + service ────────────────────────────────
FROM oven/bun@sha256:c1cc397e0be452c54f37cbcdfaa747eff93c993723af7d91658764d0fdfe5873 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/api-gateway
RUN bun run build

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
FROM oven/bun@sha256:c1cc397e0be452c54f37cbcdfaa747eff93c993723af7d91658764d0fdfe5873 AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/api-gateway/package.json ./services/api-gateway/
COPY --from=build /app/services/api-gateway/dist ./services/api-gateway/dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/api-gateway/dist/application/index.js"]