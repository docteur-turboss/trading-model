# =============================================================================
#  discovery-server — Service Discovery
#  Build context: monorepo root (.)
#  docker build -t trading-model/discovery-server -f services/discovery-server/Dockerfile .
# =============================================================================

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/discovery-server
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/discovery-server/package.json ./services/discovery-server/
COPY --from=build /app/services/discovery-server/dist ./services/discovery-server/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/discovery-server/dist/application/index.js"]