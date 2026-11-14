# Database

The project uses two database engines managed by the **Financial Scraper** (MySQL) and **Message Manager** (MongoDB) services.

---

## MySQL — Financial Scraper

**Image:** `mysql:8`

**Container:** `trading-mysql`

**Database:** `financial_scraper` (configurable via `DB_NAME` env var)

**ORM:** `ts-sql-query` with a custom `DBConnection` wrapper.

### Tables

The market data tables are defined in the SQL migrations (`scripts/migrations/`, applied by the `migrate` service):

| Table              | Content                   |
| ------------------ | ------------------------- |
| `market_candles`   | OHLCV candle data         |
| `market_trades`    | Individual trade data     |
| `market_tickers`   | 24-hour ticker statistics |
| `market_order_books` | Order book depth snapshots (ADR-0053) |

See [`docs/architecture/databases.md`](../architecture/databases.md#mysql--financial-scraper-financial-scraper) for the full column definitions, SQL DDL, composite primary keys, index conventions, and TypeScript entity interfaces.

### Persistent volume

```yaml
volumes:
  - mysql-data:/var/lib/mysql
```

### Environment variables

| Variable      | Default             | Description                      |
| ------------- | ------------------- | -------------------------------- |
| `DB_USER`     | `root`              | MySQL user                       |
| `DB_PASSWORD` | `changeme`          | MySQL password                   |
| `DB_NAME`     | `financial_scraper` | Database name                    |
| `DB_HOST`     | `mysql`             | MySQL host (Docker service name) |
| `DB_PORT`     | `3306`              | MySQL port                       |

Defined in `docker-compose.yml` via `.env` variables:

```yaml
environment:
  DB_USER: ${MYSQL_USER:-root}
  DB_PASSWORD: ${MYSQL_ROOT_PASSWORD:-changeme}
  DB_NAME: ${MYSQL_DATABASE:-financial_scraper}
  DB_HOST: mysql
  DB_PORT: '3306'
```

### Initialization

The schema is applied through SQL migrations by the `migrate` service (`docker-compose.yml`), which runs `scripts/migrate.mjs up` once `mysql` is healthy:

```yaml
migrate:
  depends_on:
    mysql:
      condition: service_healthy
```

The `financial-scraper` waits for `migrate` to complete (`condition: service_completed_successfully`) before starting.

---

## MongoDB

MongoDB 7 serves `audit-logger` (database `audit-logger`) and `dlq-service` (database `dlq`), authenticated (ADR-0067). Replica sets, users and connection settings: [databases.md](../architecture/databases.md#mongodb--message-manager-and-audit).

---

## Schema management (migrations)

### MySQL

The schema is managed via SQL migrations in `scripts/migrations/`. To create a new migration:

```bash
bun scripts/migrate.mjs create <migration_name>
```

Then edit the generated `.up.sql` / `.down.sql` files and run:

```bash
bun scripts/migrate.mjs up
```

In Docker, migrations are applied automatically by the `migrate` service on `docker compose up -d`. For a fresh start:

```bash
docker compose down -v
docker compose up -d
```

`up` and `down` hold the MySQL lock `schema_migrations` (a second run waits up to 120 s, then fails), run each statement on its own and journal it in `_migration_steps`: after a failure, fix the failed statement and rerun, the statements that already ran are not replayed and may not change. `up` refuses to run when an applied file no longer matches its checksum: put the change in a new migration. Stored programs (`DELIMITER`) are not supported ([ADR-0040](../adr/0040-locked-resumable-migrations-and-expand-contract.md)).

> ⚠️ **Expand/contract** ([ADR-0040](../adr/0040-locked-resumable-migrations-and-expand-contract.md)): migrations run before the rollout, and a rollback keeps the new schema, so the schema of release N must work with release N-1. A release only adds (table, nullable or defaulted column, index); it never drops, renames or narrows what N-1 reads or writes. The removal goes in a later release, once no running or rollback-target release uses it.

### MongoDB

MongoDB uses schema-on-read: no migration scripts.

---

## Reset

⚠️ **Permanent data loss**

```bash
docker compose down -v
```

Removes containers **and** all named volumes (`mongo-data`, `mysql-data`, `spire-data`, `spire-agent-sockets`). On next `docker compose up -d`, the schema is recreated by the `migrate` service.
