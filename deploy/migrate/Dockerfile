# SQL migrations runner for the db-migrate / db-migrate-down Jobs
# (deploy/k8s/jobs) and the compose `migrate` service, released as
# ghcr.io/trading-model/db-migrate: scripts/migrate.mjs, scripts/migrations and
# mysql2 locked by deploy/migrate/bun.lock. Nothing is installed at run time.
# Build from the repository root: docker build -f deploy/migrate/Dockerfile .
# Alpine: the Debian base ships apt, libzstd and the like, whose CVEs failed the release scan twice (v3.2.1, then v3.2.2 in CI).
FROM oven/bun:1.4.5-alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b
WORKDIR /app
COPY deploy/migrate/package.json deploy/migrate/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY scripts/migrate.mjs ./
COPY scripts/migrations ./migrations
USER bun
ENTRYPOINT ["bun", "/app/migrate.mjs"]
CMD ["up"]
