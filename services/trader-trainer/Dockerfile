# =============================================================================
#  trader-trainer — GA + DQN Trading Agent Trainer
#  Build context: monorepo root (.)
#  docker build -t trading-model/trader-trainer -f services/trader-trainer/Dockerfile .
# =============================================================================

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/trader-trainer/package.json services/trader-trainer/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/trader-trainer/ services/trader-trainer/
RUN npm ci
RUN npm run build:common
RUN npm run build:address-manager
RUN npm run build:broker-message
WORKDIR /app/services/trader-trainer
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/trader-trainer/package.json ./services/trader-trainer/

COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/address-manager/package.json ./packages/address-manager/
COPY --from=build /app/packages/address-manager/dist ./packages/address-manager/dist
COPY --from=build /app/packages/broker-message/package.json ./packages/broker-message/
COPY --from=build /app/packages/broker-message/dist ./packages/broker-message/dist

COPY --from=build /app/services/trader-trainer/dist ./services/trader-trainer/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/trader-trainer/dist/app/index.js"]
