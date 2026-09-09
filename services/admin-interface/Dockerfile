# =============================================================================
#  admin-interface — React SPA served by nginx
#  Build context: monorepo root (.)
#  docker build -t trading-model/admin-interface -f services/admin-interface/Dockerfile .
# =============================================================================

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/admin-interface/ services/admin-interface/
RUN bun install --frozen-lockfile
RUN bun run build
RUN bun run --filter admin-interface build

FROM nginx:alpine AS runtime
COPY --from=build /app/services/admin-interface/dist /usr/share/nginx/html
COPY services/admin-interface/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]