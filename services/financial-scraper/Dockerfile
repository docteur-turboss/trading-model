# =============================================================================
#  financial-scraper — Real-time Market Data Scraper
#  Build context: monorepo root (.)
#  docker build -t trading-model/financial-scraper -f services/financial-scraper/Dockerfile .
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
WORKDIR /app/services/financial-scraper
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/financial-scraper/package.json ./services/financial-scraper/
COPY --from=build /app/services/financial-scraper/dist ./services/financial-scraper/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/financial-scraper/dist/application/index.js"]