# =============================================================================
#  financial-scraper — Real-time Market Data Scraper
#  Build context: monorepo root (.)
#  docker build -t trading-model/financial-scraper -f services/financial-scraper/Dockerfile .
# =============================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/financial-scraper/package.json services/financial-scraper/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/financial-scraper/ services/financial-scraper/
RUN npm ci
RUN npm run build:common
RUN npm run build:address-manager
RUN npm run build:broker-message
WORKDIR /app/services/financial-scraper
RUN npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini

COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/financial-scraper/package.json ./services/financial-scraper/

COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/address-manager/package.json ./packages/address-manager/
COPY --from=build /app/packages/address-manager/dist ./packages/address-manager/dist
COPY --from=build /app/packages/broker-message/package.json ./packages/broker-message/
COPY --from=build /app/packages/broker-message/dist ./packages/broker-message/dist

COPY --from=build /app/services/financial-scraper/dist ./services/financial-scraper/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/financial-scraper/dist/app/index.js"]
