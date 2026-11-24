# =============================================================================
#  Dockerfile — dlq-service
#  Multi-stage: deps → build → runtime
# =============================================================================

FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
# --ignore-scripts: the root "prepare" script runs husky, a dev dependency absent here.
# Hoisted: the runtime stage only copies the root node_modules, and bun >= 1.3
# links workspaces in isolated mode (per-workspace node_modules) by default.
RUN bun install --frozen-lockfile --production --ignore-scripts --linker hoisted

FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --ignore-scripts --linker hoisted
RUN bun run build
WORKDIR /app/services/dlq-service
RUN bun run build

# Node runtime: Bun exposes neither the peer certificate on HTTPS request
# sockets nor server.setSecureContext, which SPIFFE mTLS (ADR-0011) relies on
# for caller identity and SVID rotation.
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runtime
WORKDIR /app
# npm/npx are unused at runtime; their bundled deps (undici, brace-expansion) trip the release scan (ADR-0038).
RUN apk add --no-cache tini && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/dlq-service/package.json ./services/dlq-service/
COPY --from=build /app/services/dlq-service/dist ./services/dlq-service/dist

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
ARG BUILD_VERSION=dev
ARG GIT_SHA=unknown
ENV BUILD_VERSION=$BUILD_VERSION GIT_SHA=$GIT_SHA
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD node -e 'const f=require("fs"),d="/run/spire/svid/";require("https").get(process.argv[1],{cert:f.readFileSync(d+"svid.pem"),key:f.readFileSync(d+"svid_key.pem"),rejectUnauthorized:false},r=>{r.pipe(process.stdout);process.exitCode=r.statusCode<300?0:1}).on("error",()=>process.exit(1))' https://localhost:3000/health/ready
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/dlq-service/dist/application/index.js"]
