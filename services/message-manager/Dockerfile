# =============================================================================
#  message-manager — Message Broker / Event Bus
#  Build context: monorepo root (.)
#  docker build -t trading-model/message-manager -f services/message-manager/Dockerfile .
# =============================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/message-manager/package.json services/message-manager/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/message-manager/ services/message-manager/
RUN npm ci
RUN npm run build:common
RUN npm run build:address-manager
WORKDIR /app/services/message-manager
RUN npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/message-manager/package.json ./services/message-manager/

COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/address-manager/package.json ./packages/address-manager/
COPY --from=build /app/packages/address-manager/dist ./packages/address-manager/dist

COPY --from=build /app/services/message-manager/dist ./services/message-manager/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/message-manager/dist/app/index.js"]
