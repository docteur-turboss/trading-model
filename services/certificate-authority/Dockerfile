# =============================================================================
#  Dockerfile — certificate-authority
#  Multi-stage: deps → build → runtime
# =============================================================================

# ── Stage 1: Install production dependencies ────────────────────────────────
FROM node:26-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/certificate-authority/package.json services/certificate-authority/

RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Stage 2: Build shared packages + service ────────────────────────────────
FROM node:26-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/ services/

RUN npm ci
RUN npm run build:common
RUN npm run -w @trading-model/certificate-utils build
RUN npm run -w certificate-authority build

# ── Stage 3: Runtime image ──────────────────────────────────────────────────
FROM node:26-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/certificate-utils/dist ./packages/certificate-utils/dist
COPY --from=build /app/services/certificate-authority/dist ./services/certificate-authority/dist

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -sk --cert /certs/server.crt --key /certs/server-key.pem https://localhost:3000/ping || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/certificate-authority/dist/app/index.js"]
