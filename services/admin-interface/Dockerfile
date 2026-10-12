# =============================================================================
#  admin-interface — React SPA served by nginx
#  Build context: monorepo root (.)
#  docker build -t trading-model/admin-interface -f services/admin-interface/Dockerfile .
# =============================================================================

FROM oven/bun@sha256:c1cc397e0be452c54f37cbcdfaa747eff93c993723af7d91658764d0fdfe5873 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/admin-interface/ services/admin-interface/
RUN bun install --frozen-lockfile
RUN bun run build
RUN bun run --filter admin-interface build

FROM nginx@sha256:814a8e88df978ade80e584cc5b333144b9372a8e3c98872d07137dbf3b44d0e4 AS runtime
COPY --from=build /app/services/admin-interface/dist /usr/share/nginx/html
COPY services/admin-interface/nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/run \
    && chown -R 101:101 /var/cache/nginx /var/log/nginx /var/run \
    && chown -R 101:101 /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --no-check-certificate -q -O /dev/null http://localhost:8080/health/ready || exit 1
CMD ["nginx", "-g", "daemon off;"]