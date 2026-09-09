# =============================================================================
#  Dockerfile — audit-logger
#  Multi-stage: deps → build → runtime
# =============================================================================

# ── Stage 1: Install production dependencies ────────────────────────────────
FROM node:26-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/audit-logger/package.json services/audit-logger/

RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2: Build shared packages + service ────────────────────────────────
FROM node:26-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/ services/

RUN npm ci
RUN npm run build:common
RUN npm run build:address-manager
RUN npm run build:broker-message
RUN npm run -w audit-logger build

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
FROM node:26-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/address-manager/dist ./packages/address-manager/dist
COPY --from=build /app/packages/broker-message/dist ./packages/broker-message/dist

COPY --from=build /app/services/audit-logger/dist ./services/audit-logger/dist

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/ping || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/audit-logger/dist/application/index.js"]
