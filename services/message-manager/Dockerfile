# =============================================================================
#  message-manager — Message Broker / Event Bus
#  Build context: monorepo root (.)
#  docker build -t trading-model/message-manager -f services/message-manager/Dockerfile .
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
WORKDIR /app/services/message-manager
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/message-manager/package.json ./services/message-manager/
COPY --from=build /app/services/message-manager/dist ./services/message-manager/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/message-manager/dist/application/index.js"]