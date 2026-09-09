# =============================================================================
#  trader-trainer — GA + DQN Trading Agent Trainer
#  Build context: monorepo root (.)
#  docker build -t trading-model/trader-trainer -f services/trader-trainer/Dockerfile .
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
WORKDIR /app/services/trader-trainer
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/trader-trainer/package.json ./services/trader-trainer/
COPY --from=build /app/services/trader-trainer/dist ./services/trader-trainer/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/trader-trainer/dist/infrastructure/index.js"]