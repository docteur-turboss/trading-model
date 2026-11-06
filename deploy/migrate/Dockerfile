# SQL migrations runner for the db-migrate / db-migrate-down Jobs
# (deploy/k8s/jobs) and the compose `migrate` service, released as
# ghcr.io/trading-model/db-migrate: scripts/migrate.mjs, scripts/migrations and
# mysql2 locked by deploy/migrate/bun.lock. Nothing is installed at run time.
# Build from the repository root: docker build -f deploy/migrate/Dockerfile .
FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
WORKDIR /app
COPY deploy/migrate/package.json deploy/migrate/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY scripts/migrate.mjs ./
COPY scripts/migrations ./migrations
USER bun
ENTRYPOINT ["bun", "/app/migrate.mjs"]
CMD ["up"]
