# Database

The project uses two database engines managed by the **Financial Scraper** (MySQL) and **Message Manager** (MongoDB) services.

---

## MySQL — Financial Scraper

**Image:** `mysql:8`

**Container:** `trading-mysql`

**Database:** `financial_scraper` (configurable via `DB_NAME` env var)

**ORM:** `ts-sql-query` with a custom `DBConnection` wrapper.

### Tables

Three tables are defined in the SQL migrations (`scripts/migrations/`, applied by the `migrate` service):

| Table              | Content                   |
| ------------------ | ------------------------- |
| `market_candles`   | OHLCV candle data         |
| `market_trades`    | Individual trade data     |
| `market_tickers`   | 24-hour ticker statistics |

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

## MongoDB — Shared Database Engine

**Image:** `mongo:7`

**Container:** `trading-mongo`

A single MongoDB 7 instance serves **3 databases**, each owned by a different service.

### Databases

| Database                | Service               | Connection URI                                            | Status           |
| ----------------------- | --------------------- | --------------------------------------------------------- | ---------------- |
| `message-manager`       | message-manager       | `mongodb://mongo:27017/message-manager`                   | In-memory (Zod)  |
| `audit-logger`          | audit-logger          | `mongodb://mongo:27017/audit-logger`                      | Operational      |
| `dlq-service`           | dlq-service           | `mongodb://mongo:27017/dlq-service`                       | Operational      |

### Persistent volume

```yaml
volumes:
  - mongo-data:/data/db
```

### Schema approach

Different services use different patterns:

| Service               | Schema approach                                      |
| --------------------- | ---------------------------------------------------- |
| message-manager       | Zod validation schemas only (in-memory broker)       |
| audit-logger          | Mongoose models for immutable audit events           |
| dlq-service           | Mongoose models for dead-letter queue entries        |

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

> ⚠️ Destructive changes (column removal, constraint modification) may require manual intervention in production.

### MongoDB

MongoDB uses schema-on-read. Mongoose models define document shapes at the application level. No migration scripts are required for MongoDB.

---

## Reset

⚠️ **Permanent data loss**

```bash
docker compose down -v
```

Removes containers **and** all named volumes (`mongo-data`, `mysql-data`, `spire-data`, `spire-agent-sockets`). On next `docker compose up -d`, the schema is recreated by the `migrate` service.
