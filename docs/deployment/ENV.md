# Environment Variables

Service abbreviation legend:

| Abbr. | Service                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| All   | All services (discovery-server, message-manager, financial-scraper, trader-trainer, etc.)           |
| DS    | discovery-server                                                                                    |
| MM    | message-manager                                                                                     |
| FS    | financial-scraper                                                                                   |
| TT    | trader-trainer                                                                                      |
| GW    | api-gateway                                                                                         |
| AL    | audit-logger                                                                                        |
| DLQ   | dlq-service                                                                                         |
| DC    | docker-compose.yml (host-side `.env` file)                                                          |

---

## Common — all services

Defined in `@trading-model/validation` (`config/env` — `BaseEnvSchema`), validated at startup via `application/services/validate-env`.

| Variable        | Type                                           | Default                 | Required | Description                   | Services |
| --------------- | ---------------------------------------------- | ----------------------- | -------- | ----------------------------- | -------- |
| `NODE_ENV`      | `development \| test \| staging \| production` | `production`            | no       | Runtime environment           | All*     |
| `PORT`          | number                                         | `3000`                  | no       | Internal container HTTPS port | All*     |
| `TLS_KEY_PATH`  | string                                         | `/run/spire/svid/svid_key.pem` | **yes**  | Path to TLS private key (PEM) | All*     |
| `TLS_CERT_PATH` | string                                         | `/run/spire/svid/svid.pem`     | **yes**  | Path to TLS certificate (PEM) | All*     |
| `TLS_CA_PATH`   | string                                         | `/run/spire/svid/bundle.pem`   | **yes**  | Path to CA certificate (PEM)  | All*     |
| `LOG_LEVEL`     | `error \| warn \| info \| debug` (case-insensitive) | unset: from `NODE_ENV` (`development` → `debug`, `staging` → `info`, otherwise `warn`) | no       | Level of the global logger (`@trading-model/http`), takes priority over `NODE_ENV`. Compose and every K8s ConfigMap set `info`. Invalid value: the `NODE_ENV` default plus one WARN line at startup | All*     |
| `BUILD_VERSION` | string | `dev` | no | Release version, set at image build; label of `build_info` (its `service` label is `SERVICE_NAME`, equal to the `job` label since #495; old pods still report `audit-logger-service`, `financial-scraper-service`, `message-delivery-service` until they roll) | All |
| `GIT_SHA` | string | `unknown` | no | Commit of the image, set at image build; label of `build_info` | All |
| `ENFORCE_MTLS_STRICT` | boolean (`true`/`1`)                     | `false`                 | no (set `true` in production) | Enforces the per-service caller ACL on every inbound request (ADR-0011): a caller with a valid SVID but not allowed for the target gets 403. Off: any caller with a valid SVID passes. No startup check refuses `false` in production: compose (`${ENFORCE_MTLS_STRICT:-true}`) and every K8s ConfigMap set `true` | All*     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL                              | —                       | no       | OTLP/HTTP collector base URL; traces go to `<url>/v1/traces`. Unset: tracing off | All      |

---

## Address Manager — registered services

Used by services that register with the discovery-server.

Defined in `@trading-model/validation` (`config/address-manager-env` — `AddressManagerEnvSchema`), validated at startup via `application/services/validate-env`.

| Variable                          | Type   | Default                         | Required | Description                                      | Services       |
| --------------------------------- | ------ | ------------------------------- | -------- | ------------------------------------------------ | -------------- |
| `APP_NAME`                        | string | _varies_                        | **yes**  | Logical application name                         | MM, FS, TT, AL, DLQ |
| `APP_VERSION`                     | string | `1.0.0`                         | no       | Version registered in discovery: its major is the gateway prefix `/v<major>` (FS: `2.0.0`, the others 1.x) | MM, FS, TT, AL, DLQ |
| `SERVICE_NAME`                    | string | _varies_                        | **yes**  | Service identity (discovery; `build_info` label)  | MM, FS, TT, AL, DLQ, GW, DS |
| `INSTANCE_ID`                     | string | _varies_                        | **yes**  | Unique instance identifier                       | MM, FS, TT, AL, DLQ |
| `CACHE_TTL_MS`                    | number | `30000`                         | no       | In-memory cache TTL                              | MM, FS, TT, AL, DLQ |
| `SERVICE_PING_TIMEOUT_MS`         | number | `2000`                          | no       | Timeout for health check pings                   | MM, FS, TT, AL, DLQ |
| `TOKEN_REFRESH_INTERVAL_MS`       | number | `60000`                         | no       | Auth token refresh interval                      | MM, FS, TT, AL, DLQ |
| `TTL_REFRESH_INTERVAL_MS`         | number | `15000`                         | no       | Service lease TTL refresh interval               | MM, FS, TT, AL, DLQ |
| `ADDRESS_MANAGER_URL`             | URL    | `https://discovery-server:3000` | **yes**  | Discovery server base URL                        | MM, FS, TT, AL, DLQ |
| `DISCOVERY_TIMEOUT_MS`            | number | `5000`                          | no       | Timeout of the calls to the discovery server     | MM, FS, TT, AL, DLQ |
| `DNS_NAME_MAP`                    | string | `'{}'`                          | no       | Custom DNS name to address mapping (JSON object) | MM, FS, TT, AL, DLQ |
| `ERROR_URL_WEBHOOK`               | URL    | _(empty)_                       | no       | Error notification webhook endpoint              | MM, FS, TT, DS, AL, DLQ |
| `MESSAGE_BUS_INIT_TIMEOUT_MS`     | number | `5000`                          | no       | Message bus client init timeout                  | MM, FS, TT, AL, DLQ |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | number | `5000`                          | no       | Message bus client shutdown timeout              | MM, FS, TT, AL, DLQ |
| `MESSAGE_CALLBACK_PATH`           | string | `message`                       | no       | Callback path for incoming messages              | MM, FS, TT, AL, DLQ |

---

## Redis — shared connection

Defined in `@trading-model/validation` (`config/redis-env` — `RedisEnvSchema`), turned into a connection by `redisConnectionFromEnv` (`@trading-model/persistence/redis-env`). With `REDIS_SENTINELS` set the service goes through the sentinels (K8s HA); otherwise it falls back to `REDIS_URL` (compose, dev).

| Variable                     | Type   | Default    | Required | Description                                                               | Services                |
| ---------------------------- | ------ | ---------- | -------- | ------------------------------------------------------------------------- | ----------------------- |
| `REDIS_SENTINELS`            | string | —          | no       | Sentinels as `host:port,host:port` (IP or DNS name); takes precedence over `REDIS_URL` | DS, MM, DLQ |
| `REDIS_SENTINEL_MASTER_NAME` | string | `mymaster` | no       | Master group name the sentinels monitor (only with `REDIS_SENTINELS`)     | DS, MM, DLQ |
| `REDIS_USERNAME`             | string | —          | no       | ACL user of the service (K8s: `discovery`, `message-manager`, `dlq-service`, ADR-0047; only with `REDIS_SENTINELS`) | DS, MM, DLQ |
| `REDIS_PASSWORD`             | string | —          | no       | Password of that user (only with `REDIS_SENTINELS`; with `REDIS_URL` put it in the URL). K8s: key `REDIS_<SERVICE>_PASSWORD` of `trading-model-secrets` | DS, MM, DLQ |
| `REDIS_SENTINEL_PASSWORD`    | string | —          | no       | Password the sentinels require (K8s: key `REDIS_INTERNAL_PASSWORD` of `trading-model-secrets`) | DS, MM, DLQ |

---

## Discovery Server

| Variable                      | Type   | Default          | Required | Description                        | Services |
| ----------------------------- | ------ | ---------------- | -------- | ---------------------------------- | -------- |
| `CLEANUP_SERVICE_INTERVAL_MS` | number | `600000` (10min) | no       | Interval for expired lease cleanup | DS       |
| `ERROR_URL_WEBHOOK`           | URL    | —                | no       | Error notification webhook         | DS       |
| `SIGNING_SECRET`              | string | —                | **yes** in production | HMAC secret of the instance tokens (in production: at least 32 characters, no `change-me`; start refused otherwise); shared by the replicas, stable across restarts (random per process otherwise) | DS |
| `REDIS_URL`                   | string | —                | no       | Redis URL for distributed registry | DS       |
| `ALLOWED_REGISTRATION_CIDRS`  | string | `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8` | no (must not be empty in production) | Comma-separated CIDRs allowed to register. Empty: the check is off; in production the service refuses to start | DS |

---

## Workload Identity (SPIRE / spiffe-helper)

The platform uses SPIFFE/SPIRE (ADR-0011) for workload identity, **mandatory**.
SVID files are written by `spiffe-helper` sidecars into `/run/spire/svid`
(`svid.pem`, `svid_key.pem`, `bundle.pem`) and consumed via the standard
`TLS_*_PATH` variables above. No manual certificate generation is required.

The in-house `certificate-authority` service and its `CERT_CLIENT_*` /
`CA_*` variables were **decommissioned** per ADR-0011.

---

## API Gateway

| Variable              | Type   | Default                          | Required | Description                     | Services |
| --------------------- | ------ | -------------------------------- | -------- | ------------------------------- | -------- |
| `DISCOVERY_SERVICE_URL` | URL  | `https://discovery-server:3000`  | **yes**  | Discovery server URL            | GW       |
| `RATE_LIMIT_WINDOW_MS` | number | `60000`                         | no       | Rate limit window (ms)          | GW       |
| `RATE_LIMIT_MAX`      | number | `100`                            | no       | Max requests per window, per pod: effective limit per client = value x replicas (HPA 2-8), i.e. 200 to 800 per 60 s by default (ADR-0047) | GW       |
| `CACHE_TTL_MS`        | number | `30000`                          | no       | Cache TTL for proxied responses | GW       |
| `AUTH_TOKEN_HEADER`   | string | `x-api-key`                      | no       | Header name for auth token      | GW       |
| `AUTH_TOKENS`         | string | —                                | **yes**  | Comma-separated API keys `name:scope1+scope2:secret` (in production each secret: at least 32 characters, no `change-me`; start refused otherwise) (scopes `read`, `dlq:write`; secret without `:`). A bare secret (old format) is refused at startup (ADR-0059) | GW |
| `PROXY_TIMEOUT_MS`    | number | `10000`                          | no       | Proxy request timeout           | GW       |
| `PROXY_MAX_RESPONSE_BYTES` | number | `8388608` (8 MiB)    | no       | Largest upstream answer the gateway buffers; past it the upstream request is cut and the client gets 502 `Upstream response too large` (ADR-0054) | GW |
| `AUTH_STRICT`         | boolean (only `false` turns it off) | `true`              | no (`false` refused in production) | Strict API key check. `false` with no `AUTH_TOKENS` accepts any API key: in production the gateway refuses to start with `false` | GW |
| `ALLOWED_PROXY_CIDRS` | string | `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8` | no (must not be empty in production) | Comma-separated CIDRs the resolved proxy target IP must be in. Empty: target IP check off; in production the gateway refuses to start | GW |

---

## Trader Trainer

| Variable                          | Type         | Default           | Required | Description                          | Services |
| --------------------------------- | ------------ | ----------------- | -------- | ------------------------------------ | -------- |
| `TRAINER_SYMBOLS`                 | string       | `BTCUSDT,ETHUSDT` | no       | Comma-separated trading symbols      | TT       |
| `TRAINER_DATA_WINDOW`             | number       | `500`             | no       | Data window size (inputs per step)   | TT       |
| `TRAINER_VALIDATION_SPLIT`        | number (0-1) | `0.15`            | no       | Fraction of the steps left after the test cut, used for validation (selection) | TT       |
| `TRAINER_TEST_SPLIT`              | number (0-1) | `0.15`            | no       | Newest fraction of the steps never used by training nor selection; published metrics come from it (ADR-0068) | TT       |
| `TRAINER_GENERATIONS`             | number       | `50`              | no       | Number of GA generations             | TT       |
| `TRAINER_POPULATION_SIZE`         | number       | `20`              | no       | GA population size                   | TT       |
| `TRAINER_TIME_BUDGET_MS`          | number       | `300000` (5min)   | no       | Max training time per run            | TT       |
| `TRAINER_MAX_DATA_AGE_MS`         | number       | `900000` (15min)  | no       | Newest candle older than this: symbol not trained | TT       |
| `TRAINER_EPISODES_PER_INDIVIDUAL` | number       | `10`              | no       | DRL episodes per genome evaluation (adaptive control keeps 10–30) | TT       |
| `TRAINER_FITNESS_TYPE`            | enum         | `total_pnl`       | no       | GA scalar fitness: `total_pnl`, `sharpe`, `sortino`, `calmar`, `composite` (ADR-0025) | TT       |
| `FEATURE_RISK_ADJUSTED_FITNESS`   | boolean      | `true`            | no       | Feature flag (ADR-0039): `false` forces fitness `total_pnl` whatever `TRAINER_FITNESS_TYPE` says. Invalid value: refused at startup | TT       |
| `TRAINER_OBSERVE_POSITION`        | boolean      | `true`            | no       | Show the agent its position (`false`: a constant input, to measure what it is worth, ADR-0025) | TT       |
| `TRAINER_WALK_FORWARD_FOLDS`      | number (1-20)| `1`               | no       | Walk-forward folds per training run (ADR-0030); `1`: a single train/validation split | TT       |
| `TRAINER_MODEL_DIR`               | string       | `/data/checkpoints/models` | no | Model artifact directory (ADR-0022), on the checkpoint volume shared by the replicas | TT       |
| `TRAINER_MODEL_RETENTION`         | number (≥1)  | `20`              | no       | Model versions kept per symbol           | TT       |
| `TRAINER_LEASE_NAME` | string | (empty) | no | Kubernetes Lease the trainer pods compete for; only its holder trains, every pod serves the read routes (ADR-0058). Set on `trader-trainer` in K8s; empty (compose, dev): this instance trains | TT |
| `MODEL_DOWNLOAD_CALLERS`          | string       | _(empty)_         | no       | Comma-separated services allowed to download model weights (ADR-0022). Empty: nobody | TT       |

---

## Financial Scraper — Market data

| Variable                   | Type    | Default                   | Required | Description                                                                 | Services |
| -------------------------- | ------- | ------------------------- | -------- | --------------------------------------------------------------------------- | -------- |
| `BINANCE_BASE_URL`         | URL     | `https://api.binance.com` | no       | Binance public REST API base URL (no account or API key, ADR-0026)          | FS       |
| `SYMBOLS_TO_TRACK`         | string  | `[]`                      | no       | Symbols to scrape, JSON array (`["BTCUSDT","ETHUSDT"]`) or CSV. Empty: no market data collected | FS       |
| `SCRAPE_INTERVAL`          | string  | `*/1 * * * *`             | no       | Cron expression of the scrape                                               | FS       |
| `SCRAPE_SCHEDULER_ENABLED` | boolean (`true`/`1`) | `true`       | no       | Runs the scrape cron in this instance; `false` on HTTP-only replicas (K8s runs a single cron instance) | FS       |
| `COLLECTOR_LEASE_NAME` | string | (empty) | no | Kubernetes Lease the collector pods compete for; only its holder runs the crons (ADR-0057). Set on `financial-scraper-collector` in K8s; empty (compose, dev): this instance collects | FS |
| `SIGNAL_COLLECTION_ENABLED` | boolean (`true`/`1`) | `true` | no | Collects the signal registry sources (ADR-0036) where the scrape cron runs; `false` in CI, which must not call the real sources | FS |
| `SIGNAL_CONTACT_EMAIL` | string (e-mail) | empty | no | Contact e-mail in the User-Agent of the signal sources (SEC EDGAR answers 403 without one); must be a functional, non-nominative address (project alias, no personal data sent to the US sources, see data-processing-register.md); never committed: `.env` for compose, GitHub environment secret for K8s. A value that is no e-mail disables the signal collection only | FS |

---

## Financial Scraper — Database

| Variable      | Type   | Default             | Required | Description                      | Services |
| ------------- | ------ | ------------------- | -------- | -------------------------------- | -------- |
| `DB_USER`     | string | `root`              | **yes**  | MySQL user                       | FS       |
| `DB_PASSWORD` | string | `changeme`          | **yes**  | MySQL password                   | FS       |
| `DB_NAME`     | string | `financial_scraper` | **yes**  | MySQL database name              | FS       |
| `DB_HOST`     | string | `mysql`             | no       | MySQL host (Docker service name) | FS       |
| `DB_PORT`     | number | `3306`              | no       | MySQL port                       | FS       |
| `DB_SSL_CA`   | path   | —                   | no       | PEM CA of the MySQL server certificate: TLS with certificate and host name check (K8s: Secret `mysql-tls`, ADR-0011) | FS, migrate |
| `DB_SSL_CERT` / `DB_SSL_KEY` | path | — | no | PEM client certificate and key of the MySQL user, both or none (K8s: Secret `mysql-client-<user>`, issued by cert-manager; MySQL maps it to the user with `REQUIRE ISSUER / SUBJECT`) | FS, migrate |
| `DB_SSL_VERIFY` | bool | `true` | no | `false` = TLS without certificate check; set only by `run-migrations.sh` during an upgrade from a release without TLS (mysqld not yet on the cert-manager certificate) | migrate |

---

## Message Manager

No database: subscriptions in Redis (`REDIS_SENTINELS` / `REDIS_URL`), accepted messages in a Redis Streams journal (`REDIS_URL` / `REDIS_SENTINELS` required in production, AOF on), dead letters in dlq-service ([ADR-0048](../adr/0048-durable-message-journal-in-redis-streams.md)).

| Variable                  | Type   | Default                     | Required             | Description                                                                 | Services |
| ------------------------- | ------ | --------------------------- | -------------------- | --------------------------------------------------------------------------- | -------- |
| `DLQ_AUTH_HMAC_SECRET`    | string | —                           | **yes** (production) | Signs the dead letters sent to dlq-service: same value as dlq-service (min 16 chars). Unset: dead letters stay in the local file | MM       |
| `JOURNAL_MIN_REPLICAS`    | number | `0`                         | no                   | Redis replicas that must hold an accepted message before the publisher gets its 202 (`WAIT`); 0 on a single node (compose, K8s staging), 1 in K8s production (Sentinel) | MM       |

---

## Audit Logger — MongoDB

| Variable      | Type   | Default                                 | Required | Description            | Services |
| ------------- | ------ | --------------------------------------- | -------- | ---------------------- | -------- |
| `MONGODB_URI` | string | `mongodb://mongo:27017/audit-logger`    | **yes**  | MongoDB connection URI | AL       |

---

## MySQL retention job (ADR-0051)

Read by `scripts/retention-mysql.sh` (K8s CronJob `db-retention`, compose: host cron). Not a service setting: set in `deploy/k8s/jobs/retention-cronjob.yaml` (K8s) or the shell that runs the script (compose).

| Variable                  | Type   | Default                | Required | Description | Services |
| ------------------------- | ------ | ---------------------- | -------- | ----------- | -------- |
| `RETENTION_DAYS`          | number (≥1) | `1827` (5 years)  | no       | Age after which `market_candles`, `market_trades`, `market_tickers` and `market_order_books` rows (column `timestamp`) are deleted | retention job |
| `RETENTION_SIGNALS_DAYS`  | number (≥1) | `RETENTION_DAYS`  | no       | Same for `signals` (column `observed_at`) | retention job |
| `RETENTION_BATCH_SIZE`    | number (≥1) | `10000`           | no       | Rows per `DELETE ... LIMIT` | retention job |
| `RETENTION_PAUSE_SECONDS` | number (≥0) | `1`               | no       | Pause between two batches | retention job |
| `MYSQL_RETENTION_PASSWORD` | string | —                      | **yes** in K8s | Password of MySQL user `retention` (SELECT, DELETE on the five tables). Key of Secret `trading-model-secrets`, read by `db-migrate-user` and `db-retention` | retention job |

---

## Database exporters (ADR-0056)

Passwords of the read-only users of the exporter sidecars (`docs/architecture/databases.md`, "Monitoring users"). K8s: keys of Secret `trading-model-secrets`, checked by `deploy.yml` (without them the exporters cannot log in, `MySQLDown` / `RedisDown` fire and the release rolls back). Compose: `.env`.

| Variable                  | Type   | Default | Required | Description | Services |
| ------------------------- | ------ | ------- | -------- | ----------- | -------- |
| `MYSQL_EXPORTER_PASSWORD` | string (`[A-Za-z0-9_.@%+=-]`) | — | **yes** (K8s and compose) | Password of MySQL user `exporter`, created by `db-migrate-user` (K8s) or `mysql-exporter-user` (compose), read by the `mysqld-exporter` sidecars | mysqld-exporter |
| `REDIS_EXPORTER_PASSWORD` | string | — | **yes** in K8s | Password of the Redis ACL user `exporter` (`redis-ha.sh`, data nodes and sentinels), read by the `redis-exporter` sidecars | redis-exporter |
| `MONGO_EXPORTER_PASSWORD` | string (`[A-Za-z0-9_.-]`) | — | **yes** (K8s and compose) | Password of MongoDB user `exporter` (`clusterMonitor`, ADR-0067), read by the `mongodb_exporter` sidecars | mongodb-exporter |

## MongoDB users (ADR-0067)

One user per client, created by `deploy/mongo/users.js` (K8s Jobs `mongo-dlq-users` / `mongo-audit-users`, compose `mongo-users`). K8s: keys of Secret `trading-model-secrets`, all checked by `deploy.yml`. Compose: `.env` (characters `[A-Za-z0-9_.-]`, all required).

| Variable | Type | Default | Required | Description | Services |
| -------- | ---- | ------- | -------- | ----------- | -------- |
| `MONGO_USERNAME` | string | — | no | MongoDB user of the service (`audit-logger`, `dlq-service`); unset: no authentication (dev). Set together with `MONGO_PASSWORD` | AL, DLQ |
| `MONGO_PASSWORD` | string | — | no | Its password (Secret key `MONGO_AUDIT_PASSWORD` / `MONGO_DLQ_PASSWORD`); the URI then carries `authSource=admin` and no credentials | AL, DLQ |
| `MONGO_ROOT_PASSWORD` | string | — | **yes** | User `root`: restore, user administration | mongo pods, `mongo-users` |
| `MONGO_BACKUP_PASSWORD` | string | — | **yes** | User `backup`: dumps and oplog archives | mongo pods, `mongo-users` |
| `MONGO_AUDIT_PASSWORD` | string | — | **yes** | User `audit-logger` | audit-logger, `mongo-users` |
| `MONGO_DLQ_PASSWORD` | string | — | **yes** | User `dlq-service` | dlq-service, `mongo-users` |
| `MONGO_AUDIT_KEYFILE` | string (6 to 1024 base64 characters) | — | **yes** in K8s | Internal authentication key of `mongo-audit` | mongo-audit pods |
| `MONGO_DLQ_KEYFILE` | string (same) | — | **yes** in K8s | Internal authentication key of `mongo-dlq` | mongo-dlq pods |

---

## Audit Logger — Audit chain (ADR-0027)

| Variable                  | Type    | Default          | Required | Description | Services |
| ------------------------- | ------- | ---------------- | -------- | ----------- | -------- |
| `AUDIT_RETENTION_DAYS`    | number  | `1827` (5 years) | no       | Retention of the audit events; also the minimum Object Lock retention of the anchors | AL |
| `AUDIT_CHAIN_INTERVAL_MS` | number  | `900000` (15min) | no       | Interval of the chain verification and anchoring cycle | AL |
| `AUDIT_ANCHOR_BUCKET`     | string  | —                | **yes** in production | S3 bucket with Object Lock holding the chain anchors. Unset: the chain is verified but not anchored (startup warning); in production `AUDIT_ANCHOR_REQUIRED=true` makes the service refuse to start without it (K8s: Secret `audit-anchor-s3`, checked by `deploy.yml`) | AL |
| `AUDIT_ANCHOR_PREFIX`     | string  | `audit-chain/`   | no       | Object key prefix of the anchors | AL |
| `AUDIT_ANCHOR_REGION`     | string  | `us-east-1`      | no       | S3 region of the anchor bucket | AL |
| `AUDIT_ANCHOR_ENDPOINT`   | URL     | —                | no       | S3-compatible endpoint (MinIO, Scaleway...), path-style requests. Unset: AWS | AL |
| `AUDIT_ANCHOR_REQUIRED`   | boolean (`true`/`1`) | `false` | no (`true` in production) | Refuse to start without `AUDIT_ANCHOR_BUCKET`. Set `true` by the production K8s overlay | AL |

---

## MongoDB pool — audit-logger

Read by `@trading-model/persistence` (`mongo-utils`) when the caller passes no pool size. Only audit-logger depends on it: dlq-service fixes its pool at 10 and ignores the variable.

| Variable          | Type   | Default | Required | Description                  | Services |
| ----------------- | ------ | ------- | -------- | ---------------------------- | -------- |
| `MONGO_POOL_SIZE` | number | `50`    | no       | MongoDB connection pool size | AL       |

---

## DLQ Service — MongoDB + Redis

| Variable                     | Type    | Default                              | Required | Description                          | Services |
| ---------------------------- | ------- | ------------------------------------ | -------- | ------------------------------------ | -------- |
| `MONGO_URI`                  | string  | `mongodb://localhost:27017`          | no       | MongoDB connection URI               | DLQ      |
| `MONGO_DB`                   | string  | `dlq`                                | no       | MongoDB database name                | DLQ      |
| `MONGO_COLLECTION`           | string  | `dlq_entries`                        | no       | MongoDB collection name              | DLQ      |
| `MAX_ENTRIES`                | number  | `100000`                             | no       | Maximum stored DLQ entries           | DLQ      |
| `DLQ_RETRY_MAX_ATTEMPTS`     | number  | `5`                                  | no       | Max retry attempts for replay        | DLQ      |
| `MESSAGE_MANAGER_URL`        | URL     | —                                    | no       | Message manager URL for replay       | DLQ      |
| `DLQ_AUTH_HMAC_SECRET`       | string  | —                                    | no       | HMAC secret for auth (min 16 chars), shared with message-manager | DLQ      |
| `DLQ_ALLOWED_SERVICES`       | string  | `message-manager,admin`              | no       | Callers allowed to sign requests (`admin`: operator scripts such as `examples/manage-dlq.sh`) | DLQ      |
| `DLQ_PRUNE_INTERVAL_MS`      | number  | `60000`                              | no       | Interval for pruning expired entries | DLQ      |
| `DLQ_AUTO_RETRY_ENABLED`     | boolean | `false` (`true` in compose and K8s)  | no       | Replay eligible entries automatically| DLQ      |
| `DLQ_AUTO_RETRY_INTERVAL_MS` | number  | `30000`                              | no       | Interval between auto-retry attempts | DLQ      |
| `DLQ_AUTO_RETRY_LIMIT`       | number  | `50`                                 | no       | Max auto-retry attempts per entry    | DLQ      |
| `REDIS_URL`                  | string  | —                                    | no       | Redis URL of the `dlq:queue` list (the rate limiter is in memory, ADR-0047) | DLQ      |

---

## Docker Compose (`.env` file on host)

| Variable              | Type   | Default                 | Description                        | Services |
| --------------------- | ------ | ----------------------- | ---------------------------------- | -------- |
| `DISCOVERY_PORT`      | number | `8443`                  | Host port for discovery-server     | DC       |
| `MESSAGE_PORT`        | number | `8444`                  | Host port for message-manager      | DC       |
| `SCRAPER_PORT`        | number | `8445`                  | Host port for financial-scraper    | DC       |
| `TRAINER_PORT`        | number | `8446`                  | Host port for trader-trainer       | DC       |
| `GATEWAY_PORT`        | number | `8448`                  | Host port for api-gateway          | DC       |
| `AUDIT_PORT`          | number | `8450`                  | Host port for audit-logger         | DC       |
| `DLQ_PORT`            | number | `8452`                  | Host port for dlq-service          | DC       |
| `EDGE_PORT`           | number | `8449`                  | Host port for edge-proxy (HTTP)    | DC       |
| `EDGE_LIMIT_KEY_INC`  | path   | `./deploy/edge-proxy/edge-limit-key.inc` | Edge rate-limit key file; `edge-limit-key.off.inc` disables the limit for k6 load runs | DC |
| `MYSQL_ROOT_PASSWORD` | string | `changeme`              | MySQL root password                | DC       |
| `GRAFANA_PASSWORD`    | string | (required)              | Grafana admin password             | DC       |
| `GRAFANA_OIDC_ENABLED` | string | `false` (compose), unset (K8s) | `true` turns on Grafana OIDC login and hides the local login form (`GF_AUTH_DISABLE_LOGIN_FORM`, K8s); off otherwise (ADR-0063) | DC, K8s |
| `GRAFANA_BASIC_AUTH_ENABLED` | string | unset (K8s) | Set `false` together with `GRAFANA_OIDC_ENABLED=true`: refuses `Authorization: Basic` on the public Ingress (`GF_AUTH_BASIC_ENABLED`); unset keeps Grafana's default (on). Break-glass: `runbook-grafana-break-glass.md` | K8s |
| `GRAFANA_OIDC_CLIENT_ID` | string | (unset) | OIDC client id (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_CLIENT_SECRET` | string | (unset) | OIDC client secret (K8s: key of `trading-model-secrets`) (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_AUTH_URL` | string | (unset) | OIDC authorization endpoint (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_TOKEN_URL` | string | (unset) | OIDC token endpoint (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_API_URL` | string | (unset) | OIDC userinfo endpoint (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_ALLOWED_DOMAINS` | string | (unset) | E-mail domains allowed to log in; required in production K8s (ADR-0063) | DC, K8s |
| `GRAFANA_ROOT_URL` | string | `http://localhost:3000/` (compose) | Public Grafana URL, base of the OIDC `redirect_uri`; K8s: `https://grafana.<host>/` of the ingress (ADR-0063) | DC, K8s |
| `MYSQL_EXPORTER_PASSWORD` | string | (required)          | Password of the read-only MySQL user `exporter` of mysqld-exporter (ADR-0056) | DC |
| `MONGO_ROOT_PASSWORD`, `MONGO_EXPORTER_PASSWORD`, `MONGO_BACKUP_PASSWORD`, `MONGO_AUDIT_PASSWORD`, `MONGO_DLQ_PASSWORD` | string | (required) | MongoDB users (ADR-0067), see "MongoDB users" above | DC |
| `MYSQL_DATABASE`      | string | `financial_scraper`     | MySQL database name                | DC       |
| `IMAGE_REGISTRY`      | string | `ghcr.io/trading-model` | Container registry prefix          | DC       |
| `IMAGE_TAG`           | string | `latest`                | Image tag to pull                  | DC       |
| `APP_VERSION`         | string | `1.0.0`                 | Version tag for Docker images      | DC       |
| `INSTANCE_ID`         | string | `instance-1`            | Instance identifier for deployment | DC       |

---

## Deploy workflow (GitHub environment variables)

| Variable | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| `BACKUP_S3_ALLOWED_REGIONS` | space-separated list | EU regions of AWS (`eu-*`), Scaleway (`fr-par nl-ams pl-waw`), OVH (`gra sbg rbx par`) | Regions the off-site backup bucket may be in. `deploy.yml` runs `scripts/backup-bucket-check.sh`: a bucket elsewhere, or whose region cannot be read, is an error in production and a warning elsewhere (`BACKUP_S3_IMMUTABILITY_CHECK=warn` downgrades both). GDPR art. 44, `docs/compliance/third-party-dpas.md` |

---

## Validation

All environment variables are validated at startup via **Zod schemas**. If a required variable is missing or has an invalid value, the service exits immediately with a clear error message.

Example error:

```
❌ Invalid environment configuration
TLS_KEY_PATH: Required
```

This guarantees fail-fast behavior — misconfigured services never start.

---

## Complete `.env` example

```bash
# Node environment
NODE_ENV=production
LOG_LEVEL=info
APP_VERSION=1.0.0
INSTANCE_ID=instance-1

# Port mapping (host : container)
DISCOVERY_PORT=8443
MESSAGE_PORT=8444
SCRAPER_PORT=8445
TRAINER_PORT=8446
GATEWAY_PORT=8448
EDGE_PORT=8449
AUDIT_PORT=8450

# mTLS is automatic via SPIRE (ADR-0011) — no TLS_CERTS_DIR needed

# MySQL
MYSQL_ROOT_PASSWORD=changeme
GRAFANA_PASSWORD=change-me-grafana-admin-password
MYSQL_EXPORTER_PASSWORD=change-me-mysql-exporter-password
MONGO_ROOT_PASSWORD=change-me-mongo-root-password
MONGO_EXPORTER_PASSWORD=change-me-mongo-exporter-password
MONGO_BACKUP_PASSWORD=change-me-mongo-backup-password
MONGO_AUDIT_PASSWORD=change-me-mongo-audit-password
MONGO_DLQ_PASSWORD=change-me-mongo-dlq-password
MYSQL_DATABASE=financial_scraper

# Trader-Trainer
TRAINER_SYMBOLS=BTCUSDT,ETHUSDT
TRAINER_DATA_WINDOW=500
TRAINER_VALIDATION_SPLIT=0.15
TRAINER_TEST_SPLIT=0.15
TRAINER_GENERATIONS=50
TRAINER_POPULATION_SIZE=20
TRAINER_TIME_BUDGET_MS=300000
TRAINER_MAX_DATA_AGE_MS=900000
TRAINER_EPISODES_PER_INDIVIDUAL=10
TRAINER_FITNESS_TYPE=total_pnl
TRAINER_OBSERVE_POSITION=true

# API Gateway auth
AUTH_TOKENS=ops-alice:read+dlq:write:token1,grafana:read:token2

# Error webhook (optional)
ERROR_URL_WEBHOOK=
```

> **Never commit the `.env` file.** It is in `.gitignore`. Use `.env.example` as a template.
