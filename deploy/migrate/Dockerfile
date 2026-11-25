# SQL migrations runner for the db-migrate / db-migrate-down Jobs
# (deploy/k8s/jobs) and the compose `migrate` service, released as
# ghcr.io/trading-model/db-migrate: scripts/migrate.mjs, scripts/migrations and
# mysql2 locked by deploy/migrate/bun.lock. Nothing is installed at run time.
# Build from the repository root: docker build -f deploy/migrate/Dockerfile .
FROM oven/bun:1.4.5@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18
WORKDIR /app
COPY deploy/migrate/package.json deploy/migrate/bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY scripts/migrate.mjs ./
COPY scripts/migrations ./migrations
USER bun
ENTRYPOINT ["bun", "/app/migrate.mjs"]
CMD ["up"]
