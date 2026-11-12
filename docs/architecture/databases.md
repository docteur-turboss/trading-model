# Database Architecture

The project uses two database engines managed by different services.

## MySQL — Financial Scraper

Used by `financial-scraper` to persist market data. All tables live in the `financial_scraper` database. The ORM is [`ts-sql-query`](https://github.com/vernic/ts-sql-query) with a custom `DBConnection` wrapper.

| Table | Stores | Key fields |
| ----- | ------ | ---------- |
| `market_candles` | OHLCV candle data | symbol, market, source, interval, open/high/low/close, volume, timestamp |
| `market_trades` | Individual trade data | symbol, trade_id, price, quantity, side, timestamp |
| `market_tickers` | 24-hour ticker statistics | symbol, open/high/low/last, volume, timestamp |
| `market_order_books` | Order book depth snapshots, kept for historical replay, never served by the API (ADR-0053) | symbol, market, source, timestamp, bids / asks (JSON `[price, quantity]` pairs, best first) |
| `market_publish_cursors` | Per candle series, open time of the next candle to publish to the bus (the persisted candles from it wait for message-manager) | source, symbol, interval, market, published_until |
| `signals` | Signals of every dimension from the source registry (ADR-0036): one observation about an asset or a sector | id, source_id, dimension, asset_id / sector, observed_at, ingested_at, confidence_score, payload (JSON, canonical per dimension) |

Full DDL, column specs, and TypeScript interfaces: [Table Schemas Reference](../reference/table-schemas.md).

## MongoDB — Message Manager and Audit

MongoDB 7 is used by several services via the native `mongodb` driver (no Mongoose):

| Service | Stores |
| ------- | ------ |
| **audit-logger** | Audit event persistence (replica set `mongo-audit`) |
| **dlq-service** | Dead letter entries (replica set `mongo-dlq`) |

Network access (K8s, issue #727): MongoDB runs without authentication (issue #669) and without TLS, so the NetworkPolicies are the only barrier. Port 27017 of each replica set accepts only its owner service, its own members and its init Job (`mongo-audit-network-policy`: `audit-logger`, `mongodb-audit`, `mongodb-audit-init`; `mongodb-network-policy`: `dlq-service`, `mongodb`, `mongodb-init`), and port 9216 (exporter) only Prometheus. Backups and restores go through `kubectl exec` into the members, not the network. A new client is a label in that policy, checked on kind by `verify_mongo_ingress` (`tests/k8s/run-kind.sh`).

Authentication (ADR-0067): a `keyFile` per replica set, and one user per client, all in `admin` (clients connect with `authSource=admin`), created by `deploy/mongo/users.js` (Jobs `mongo-*-users`, compose `mongo-users`):

| User | Roles | Used by |
| ---- | ----- | ------- |
| `audit-logger` | `readWrite` on the audit database | audit-logger (`MONGO_USERNAME` / `MONGO_PASSWORD`) |
| `dlq-service` | `readWrite` on `dlq` | dlq-service |
| `exporter` | `clusterMonitor` | `mongodb_exporter` sidecars |
| `backup` | `backup` | `mongodump` and the hourly oplog archives |
| `root` | `root` | restore (oplog replay), user administration |

Release 3.1.0 starts mongod with `--transitionToAuth` (clients without credentials still accepted, so the rolling restart never breaks the set); the next release removes the flag. `packages/persistence/tests/db/mongo-users.db.spec.ts` proves each user gets `Unauthorized` outside its scope.

> SPIRE Server (ADR-0011) keeps its datastore in SQLite on its own volume (`spire-server-data`, ADR-0065), not in MySQL: losing `mysql-0` stops market data ingestion only, SVIDs keep being issued. The `spire` database of the releases before ADR-0065 stays in MySQL, read by nothing but a rollback of the SPIRE server; it goes with the contract step.

Network access (K8s, issue #747): ports 3306 / 33061 of MySQL accept only `financial-scraper`, `financial-scraper-collector`, `spire-server` (only for a rollback to a release before ADR-0065), the Jobs `db-migrate`, `db-migrate-down`, `db-migrate-user`, the `retention` CronJob and the `mysql` members; Redis ports 6379 / 26379 accept only `discovery-server`, `message-manager`, `dlq-service`, `audit-logger`, `financial-scraper`, `trader-trainer` (the last three only read Redis while a rollback to N-1 is possible) and the Redis pods. Backups go through `kubectl exec`. A new client is a label in `mysql-network-policy` / `redis-network-policy`, checked on kind by `verify_db_ingress`.

## Redis — who uses it, with which keys

Inventory (issue #506). Address-manager caches in memory per process, so only three services still talk to Redis (K8s: through the sentinels). Never `KEYS` (ADR-0023).

| Service | Key prefix | Commands | Purpose |
| ------- | ---------- | -------- | ------- |
| discovery-server | `trading-model:discovery:*` | `GET SET DEL MGET SADD SREM SMEMBERS SISMEMBER SCARD MULTI EVAL` | Instance registry and tokens (ADR-0023) |
| message-manager | `trading-model:message-manager:subscriptions:<topic>` | `HSET HGETALL HDEL PEXPIRE` | Broker subscriptions |
| message-manager | `trading-model:message-manager:journal:<topic>`, `trading-model:message-manager:journal-groups` | `EXISTS XADD XDEL XREADGROUP XPENDING XCLAIM XACK XGROUP XINFO XRANGE WAIT SADD SMEMBERS` | Durable message journal (ADR-0048) |
| dlq-service | `dlq:queue` | `LLEN LPUSH LRANGE LTRIM EVAL EVALSHA SCRIPT LOAD` | Replay queue, a cache of the MongoDB entries (rebuilt from MongoDB; the HTTP rate limiter is in memory) |
| redis_exporter sidecar (user `exporter`) | none | `PING INFO CLIENT SETNAME SLOWLOG GET/LEN LATENCY LATEST/HISTOGRAM`; on the sentinels `SENTINEL MASTERS/SENTINELS/SLAVES/REPLICAS/CKQUORUM` | Metrics (ADR-0056): never `CONFIG GET`, which would hand out `masterauth` |

Dead letters live in MongoDB, not Redis.

Isolation (ADR-0047, K8s): each row is an ACL user (`discovery`, `message-manager`, `dlq-service`) limited to its key pattern and to these commands plus `PING INFO ROLE CLIENT SETNAME/SETINFO MULTI EXEC`; the default user is off and the sentinels require the password (2.x clients, which used neither, are refused); the `ha` user (replication, Sentinel, probes) reaches no key. Rules live in `deploy/k8s/infra/redis-ha.sh`; `packages/persistence/tests/db/k8s-redis-ha.db.spec.ts` proves a service is refused outside its prefix, and the `exporter` user outside its read-only commands. Compose runs one unauthenticated Redis (dev).

## Monitoring users (ADR-0056)

Each database pod runs an exporter sidecar scraped by Prometheus (port `metrics`, reachable from the Prometheus pod only):

| Database | Exporter | Identity |
| -------- | -------- | -------- |
| MySQL (every member) | `mysqld-exporter` | MySQL user `exporter`: `PROCESS, REPLICATION CLIENT` on `*.*`, `SELECT` on `performance_schema.*`, 3 connections at most; created by Job `db-migrate-user` (password `MYSQL_EXPORTER_PASSWORD`; compose: one-shot `mysql-exporter-user`) |
| Redis data nodes and sentinels | `redis_exporter` | ACL user `exporter` above (`REDIS_EXPORTER_PASSWORD`, K8s); compose Redis has no ACL |
| MongoDB `mongo-dlq` and `mongo-audit` (every member) | `mongodb_exporter` | MongoDB user `exporter`: `clusterMonitor` only (`MONGO_EXPORTER_PASSWORD`, ADR-0067) |

## Schema Validation

The message broker uses **Zod validation schemas** at `services/message-manager/src/adapters/inbound/validation/broker.schema.ts` to enforce message shapes, subscriptions, and metadata.
