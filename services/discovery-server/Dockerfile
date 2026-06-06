# =============================================================================
#  discovery-server — Service Discovery
#  Build context: monorepo root (.)
#  docker build -t trading-model/discovery-server -f services/discovery-server/Dockerfile .
# =============================================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/package.json services/discovery-server/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/ services/discovery-server/
RUN npm ci
RUN npm run build:common
WORKDIR /app/services/discovery-server
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/discovery-server/package.json ./services/discovery-server/

COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist

COPY --from=build /app/services/discovery-server/dist ./services/discovery-server/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/discovery-server/dist/app/index.js"]
