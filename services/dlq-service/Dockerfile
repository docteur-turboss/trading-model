FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/dlq-service/package.json services/dlq-service/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/dlq-service/ services/dlq-service/
RUN npm ci
RUN npm run build:common
RUN npm run build:address-manager
WORKDIR /app/services/dlq-service
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/dlq-service/package.json ./services/dlq-service/
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/address-manager/package.json ./packages/address-manager/
COPY --from=build /app/packages/address-manager/dist ./packages/address-manager/dist
COPY --from=build /app/services/dlq-service/dist ./services/dlq-service/dist
EXPOSE 3000

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--max-old-space-size=192", "services/dlq-service/dist/infrastructure/app/index.js"]
