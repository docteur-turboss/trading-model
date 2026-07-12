# Database

The project uses two database engines managed by the **Financial Scraper** (MySQL) and **Message Manager** (MongoDB) services.

---

## MySQL — Financial Scraper

**Image:** `mysql:8`

**Container:** `trading-mysql`

**Database:** `financial_scraper` (configurable via `DB_NAME` env var)

**ORM:** `ts-sql-query` with a custom `DBConnection` wrapper.

### Tables

Three tables are defined in `scripts/init-db.sql` (mounted in `/docker-entrypoint-initdb.d/`):

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

The file `scripts/init-db.sql` is mounted in the MySQL container:

```yaml
volumes:
  - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
```

MySQL automatically executes all `.sql` files in this directory on **first startup** (empty database).

---

## MongoDB — Shared Database Engine

**Image:** `mongo:7`

**Container:** `trading-mongo`

A single MongoDB 7 instance serves **5 databases**, each owned by a different service.

### Databases

| Database                | Service               | Connection URI                                            | Status           |
| ----------------------- | --------------------- | --------------------------------------------------------- | ---------------- |
| `message-manager`       | message-manager       | `mongodb://mongo:27017/message-manager`                   | In-memory (Zod)  |
| `certificate-authority` | certificate-authority | `mongodb://mongo:27017/certificate-authority`             | Operational      |
| `audit-logger`          | audit-logger          | `mongodb://mongo:27017/audit-logger`                      | Operational      |
| `dlq-service`           | dlq-service           | `mongodb://mongo:27017/dlq-service`                       | Operational      |
| `dlq-service`           | dlq-service           | `mongodb://mongo:27017/dlq-service`                       | Active           |

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
| certificate-authority | Mongoose models for certificates, keys, CRLs         |
| audit-logger          | Mongoose models for immutable audit events           |
| dlq-service           | Mongoose models for dead-letter queue entries        |

---

## Schema management (migrations)

### MySQL

For schema changes, add `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` statements to `scripts/init-db.sql`, then restart the MySQL container:

```bash
docker compose down -v mysql
docker compose up -d mysql
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

Removes containers **and** all named volumes (`mongo-data`, `mysql-data`, `ca-keys`). On next `docker compose up -d`, databases are reinitialized via init scripts.
