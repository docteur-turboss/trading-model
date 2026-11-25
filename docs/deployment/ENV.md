# Environment Variables

Service abbreviation legend:

| Abbr. | Service                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| All   | All services (financial-scraper, trader-trainer, etc.)           |
| FS    | financial-scraper                                                                                   |
| TT    | trader-trainer                                                                                      |
| GW    | api-gateway                                                                                         |
| AL    | audit-logger                                                                                        |
| ME    | model-evaluator                                                                                     |
| RX    | risk-execution                                                                                      |
| DCN   | decision-consumer                                                                                   |
| DC    | docker-compose.yml (host-side `.env` file)                                                          |

---

## Common — all services

Defined in `@trading-model/http` (`config/env` — `BaseEnvSchema`), validated at startup via `application/services/validate-env`.

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
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL                              | —                       | no       | OTLP/HTTP collector base URL; traces go to `<url>/v1/traces`. Unset: tracing off | All      |

---

## Address Manager

Used by services that resolve other services (DNS).

Defined in `@trading-model/address-manager` (`config/address-manager-env` — `AddressManagerEnvSchema`), validated at startup via `application/services/validate-env`.

| Variable                          | Type   | Default                         | Required | Description                                      | Services       |
| --------------------------------- | ------ | ------------------------------- | -------- | ------------------------------------------------ | -------------- |
| `APP_NAME`                        | string | _varies_                        | **yes**  | Logical application name                         | FS, TT, AL |
| `APP_VERSION`                     | string | `1.0.0`                         | no       | Application version: its major is the gateway prefix `/v<major>` (FS: `2.0.0`, the others 1.x) | FS, TT, AL |
| `SERVICE_NAME`                    | string | _varies_                        | **yes**  | Service identity (`build_info` label)  | FS, TT, AL, GW |
| `INSTANCE_ID`                     | string | _varies_                        | **yes**  | Unique instance identifier                       | FS, TT, AL |
| `DNS_NAME_MAP`                    | string | `'{}'`                          | no       | Custom DNS name to address mapping (JSON object); not read by the gateway | FS, TT, AL |

---

## Redis — shared connection

Defined in `@trading-model/persistence/redis-env` (`RedisEnvSchema`) and turned into a connection by `redisConnectionFromEnv`. With `REDIS_SENTINELS` set the service goes through the sentinels (K8s HA); otherwise it falls back to `REDIS_URL` (compose, dev).

| Variable                     | Type   | Default    | Required | Description                                                               | Services                |
| ---------------------------- | ------ | ---------- | -------- | ------------------------------------------------------------------------- | ----------------------- |
| `REDIS_URL`                  | string | —          | no       | Redis URL (compose, dev): used when `REDIS_SENTINELS` is unset; the bus refuses to start without one of them | AL, FS, TT, ME, RX |
| `REDIS_SENTINELS`            | string | —          | no       | Sentinels as `host:port,host:port` (IP or DNS name); takes precedence over `REDIS_URL` | AL, FS, TT, ME, RX |
| `REDIS_SENTINEL_MASTER_NAME` | string | `mymaster` | no       | Master group name the sentinels monitor (only with `REDIS_SENTINELS`)     | AL, FS, TT, ME, RX |
| `REDIS_USERNAME`             | string | —          | no       | ACL user of the service (K8s: one per service, ADR-0047; only with `REDIS_SENTINELS`) | AL, FS, TT, ME, RX |
| `REDIS_PASSWORD`             | string | —          | no       | Password of that user (only with `REDIS_SENTINELS`; with `REDIS_URL` put it in the URL). K8s: key `REDIS_<SERVICE>_PASSWORD` of `trading-model-secrets` | AL, FS, TT, ME, RX |
| `REDIS_SENTINEL_PASSWORD`    | string | —          | no       | Password the sentinels require (K8s: key `REDIS_INTERNAL_PASSWORD` of `trading-model-secrets`) | AL, FS, TT, ME, RX |
| `REDIS_TLS_MODE` | `optional` | `required` | `optional` | no | `required`: TLS to Redis and the sentinels, needs `REDIS_TLS_CA` (release N+1, ADR-0047, `docs/deployment/REDIS_TLS.md`) | AL, FS, TT, ME, RX |
| `REDIS_TLS_CA` | path | — | with `required` | PEM CA of the Redis server certificates (K8s: `ca.crt` of Secret `redis-tls`) | AL, FS, TT, ME, RX |
| `REDIS_TLS_SERVERNAME` | string | `redis` | no | Name the Redis certificate must carry (nodes are reached by IP) | AL, FS, TT, ME, RX |

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
| `RATE_LIMIT_WINDOW_MS` | number | `60000`                         | no       | Rate limit window (ms)          | GW       |
| `RATE_LIMIT_MAX`      | number | `100`                            | no       | Max requests per window, per pod: effective limit per client = value x replicas (HPA 2-8), i.e. 200 to 800 per 60 s by default (ADR-0047) | GW       |
| `CACHE_TTL_MS`        | number | `30000`                          | no       | Cache TTL for proxied responses | GW       |
| `AUTH_TOKEN_HEADER`   | string | `x-api-key`                      | no       | Header name for auth token      | GW       |
| `AUTH_TOKENS`         | string | —                                | **yes**  | Comma-separated API keys `name:scope1+scope2:secret` (in production each secret: at least 32 characters, no `change-me`; start refused otherwise) (scopes `read`, `risk:admin`; secret without `:`). A bare secret (old format) is refused at startup (ADR-0059) | GW |
| `PROXY_TIMEOUT_MS`    | number | `10000`                          | no       | Proxy total deadline (ms)       | GW       |
| `PROXY_MAX_RESPONSE_BYTES` | number | `8388608` (8 MiB)    | no       | Largest upstream answer the gateway buffers; past it the upstream request is cut and the client gets 502 `Upstream response too large` (ADR-0054) | GW |
| `ALLOWED_PROXY_CIDRS` | string | `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8` | no (must not be empty in production) | Comma-separated CIDRs the resolved proxy target IP must be in. Empty: target IP check off; in production the gateway refuses to start | GW |

---

## Trader Trainer

| Variable                          | Type         | Default           | Required | Description                          | Services |
| --------------------------------- | ------------ | ----------------- | -------- | ------------------------------------ | -------- |
| `TRAINER_SYMBOLS`                 | string       | `BTCUSDT,ETHUSDT` | no       | Comma-separated trading symbols      | TT       |
| `TRAINER_ASSETS`                | string       | empty             | no       | `ASSET:type` pairs (`AAPL:equity,AGG:bond`): registry assets trained on daily bars rebuilt from their `market` signals, the asset id being the model symbol (ADR-0083); empty: crypto only | TT       |
| `TRAINER_ASSET_COSTS`           | JSON         | `{}`              | no       | `{"equity":{"feeRate":0.0005,"executionCostRate":0.0005}}`: costs of the daily assets by type over the defaults of ADR-0083 | TT       |
| `TRAINER_SYMBOL_ASSETS`           | string       | empty             | no       | `SYMBOL:ASSET` pairs (`BTCUSDT:BTC,ETHUSDT:ETH`): registry asset whose point-in-time signal window (30 days) a session reads and measures; empty: no call | TT       |
| `TRAINER_SIGNAL_FEATURES`         | string       | empty             | no       | `SUBJECT:dimension:metric` list (`BTC:social:pageviews`, subject = asset, sector or area): signals fed to the network as value, age and confidence inputs, 3 per metric (ADR-0081); read only with `FEATURE_SIGNAL_INPUTS`; each key must match the format or the service refuses to start; a key that finds no signal in the window logs a warning and trains on zeros | TT       |
| `FEATURE_SIGNAL_INPUTS`           | boolean      | `false`           | no       | Feature flag (ADR-0039): `true` appends the `TRAINER_SIGNAL_FEATURES` inputs to the 18 market inputs; `false`: input and published genome as before | TT       |
| `FEATURE_INPUT_MASK_GENE`         | boolean      | `false`           | no       | Feature flag (ADR-0039, ADR-0082): `true` lets the GA evolve a mask over the input groups (candle, window, one per signal metric); `false`: no mask, genome and manifest as before | TT       |
| `FEATURE_SHARED_TRUNK`            | boolean      | `false`           | no       | Feature flag (ADR-0039, ADR-0076 step 1): `true` trains all the symbols in one session, hidden layers shared, one output head per symbol, each symbol published as its own model with `components` naming the trunk; `false`: one session per symbol, genome and manifest as before | TT       |
| `TRAINER_INPUT_MASK_PROTECT_CANDLE` | boolean    | `false`           | no       | `true` keeps the candle group active in every mask the GA evolves (ADR-0082); read only with `FEATURE_INPUT_MASK_GENE` | TT       |
| `TRAINER_DATA_WINDOW`             | number       | `500`             | no       | Data window size (inputs per step)   | TT       |
| `TRAINER_VALIDATION_SPLIT`        | number (]0, 1[) | `0.15`            | no       | Fraction of the steps left after the test cut, used for validation (selection) | TT       |
| `TRAINER_TEST_SPLIT`              | number (]0, 1[) | `0.15`            | no       | Newest fraction of the steps never used by training nor selection; published metrics come from it (ADR-0068) | TT       |
| `TRAINER_GENERATIONS`             | number       | `50`              | no       | Number of GA generations             | TT       |
| `TRAINER_POPULATION_SIZE`         | number       | `20`              | no       | GA population size                   | TT       |
| `TRAINER_TIME_BUDGET_MS`          | number       | `300000` (5min)   | no       | Max training time per run            | TT       |
| `TRAINER_INTERVAL_MS`             | number       | `14400000` (4h)   | no       | Time between two training sessions   | TT       |
| `TRAINER_MAX_DATA_AGE_MS`         | number       | `900000` (15min)  | no       | Newest candle older than this: symbol not trained | TT       |
| `TRAINER_EPISODES_PER_INDIVIDUAL` | number       | `10`              | no       | DRL episodes per genome evaluation (adaptive control keeps 10–30) | TT       |
| `TRAINER_FITNESS_TYPE`            | enum         | `total_pnl`       | no       | GA scalar fitness: `total_pnl`, `sharpe`, `sortino`, `calmar`, `composite` (ADR-0025) | TT       |
| `FEATURE_RISK_ADJUSTED_FITNESS`   | boolean      | `true`            | no       | Feature flag (ADR-0039): `false` forces fitness `total_pnl` whatever `TRAINER_FITNESS_TYPE` says. Invalid value: refused at startup | TT       |
| `FEATURE_ACTION_SPACE_GENE`        | boolean      | `false`           | no       | Feature flag (ADR-0039, ADR-0076): `true` lets the GA mutate the action set (partial order sizes, recorded as `actions` in the manifest); `false`: `sell_hold_buy`, never mutated | TT       |
| `FEATURE_EVENT_DRIVEN_DECISIONS`   | boolean      | `false`           | no       | Feature flag (ADR-0039, ADR-0076 §5): `true` makes the agent decide on market events (price move, volume) instead of every bar; network gets a 33rd input `BarsSinceDecision`. `false`: genome and manifest unchanged. Invalid value: refused at startup | TT       |
| `TRAINER_SHARED_TRUNK_SYMBOLS_PER_GENERATION` | int | `0` | no | ADR-0076 step 1, read only with `FEATURE_SHARED_TRUNK`: symbols each generation trains and evaluates on, a rotating subset of the group (k in [1, number of symbols], refused above; `0`: `max(1, floor(N / 3))`; k = N: every symbol every generation) | TT       |
| `TRAINER_SEED_OFFSET`             | int          | `0`               | no       | Added to the default PRNG seeds: same value and same data give the same run (A/B measures, ADR-0030) | TT       |
| `TRAINER_OBSERVE_POSITION`        | boolean      | `true`            | no       | Show the agent its position (`false`: a constant input, to measure what it is worth, ADR-0025) | TT       |
| `TRAINER_WALK_FORWARD_FOLDS`      | number (1-20)| `1`               | no       | Walk-forward folds per training run (ADR-0030); `1`: a single train/validation split | TT       |
| `TRAINER_MODEL_DIR`               | string       | `/data/checkpoints/models` | no | Model artifact directory (ADR-0022), on the checkpoint volume shared by the replicas; model-evaluator and risk-execution mount it read-only (ADR-0089) | TT, ME, RX |
| `TRAINER_MODEL_RETENTION`         | number (≥1)  | `20`              | no       | Model versions kept per symbol           | TT       |
| `TRAINER_LEASE_NAME` | string | (empty) | no | Kubernetes Lease the trainer pods compete for; only its holder trains, every pod serves the read routes (ADR-0058). Set on `trader-trainer` in K8s; empty (compose, dev): this instance trains | TT |
| `MODEL_DOWNLOAD_CALLERS`          | string       | _(empty)_         | no       | Comma-separated services allowed to download model weights (ADR-0022). Empty: nobody; `model-evaluator,decision-consumer` in compose and K8s (ADR-0049, ADR-0089) | TT       |

---

## Model Evaluator

| Variable | Type | Default | Required | Description | Services |
| --- | --- | --- | --- | --- | --- |
| `EVALUATIONS_DIR` | string | `/data/evaluations` | no | Directory of the evaluation records, one file per `(symbol, version)` created exclusively; a ReadWriteOnce PVC in K8s, a volume in compose (ADR-0049) | ME |

---

## Risk/Execution

ADR-0064. Limits are validated at startup and refuse to start above their hard ceiling in code (`services/risk-execution/src/domain/limits.ts`); percentages are shares of `RISK_ALLOCATED_CAPITAL`.

| Variable | Type | Default | Required | Description | Services |
| --- | --- | --- | --- | --- | --- |
| `EXECUTION_MODE` | `paper | live` | `paper` | no | Only the production overlay may say `live` (`tests/k8s/check-overlays.mjs`); the service refuses `live` outside production, without live keys, and `paper` with live keys. No live adapter exists yet: `live` stops the start | RX |
| `DEPLOYMENT_ENV` | `development | ci | staging | production` | `development` | no | The deployment (NODE_ENV is `production` everywhere in K8s); `production` only in the production overlay | RX |
| `BROKER_API_KEY` | string | _(unset)_ | no | Live broker key, in the production Secret only; its presence in paper mode refuses the start | RX |
| `BROKER_API_SECRET` | string | _(unset)_ | no | Live broker secret, same rule as `BROKER_API_KEY` | RX |
| `RISK_STATE_DIR` | string | `/data/risk-execution` | no | Durable state (kill switch, orders, paper ledger); a ReadWriteOnce PVC in K8s. An unreadable state engages the global kill switch | RX |
| `RISK_ALLOCATED_CAPITAL` | number | `10000` | no | Allocated capital of the mode (policy §2) | RX |
| `RISK_INSTRUMENTS` | JSON | `{"BTCUSDT":{"maxQuantity":0.01}}` | no | Allow-list of spot instruments with their quantity cap per order | RX |
| `RISK_LIMITS_JSON` | JSON | `{}` | no | Overrides of the other caps of ADR-0064 §2 (at or below their ceiling) | RX |
| `RISK_OWNER_ACTOR` | string | `owner` | no | Only this actor re-arms after the drawdown stop (policy §4.4) | RX |
| `RISK_TICK_MS` | number | `10000` | no | Period of expiry, stale-data, limit and reconciliation checks | RX |

## Decision Consumer

ADR-0087. Paper only: no broker key, no kill switch, no mode choice (ADR-0064 §1, §5, §6).

| Variable | Type | Default | Required | Description | Services |
| --- | --- | --- | --- | --- | --- |
| `PROMOTED_MODELS` | string | _(empty)_ | no | Models promoted by hand, `symbol@version` separated by commas, one version per symbol (ADR-0087 §2). Empty: nothing decides. A promoted model that is not `admissible` (ADR-0069) decides nothing | DCN |
| `DECISION_TICK_MS` | number | `10000` | no | Period of the pass over the promoted models; each decides once per closed bar of its manifest interval (1 min or 1 day) | DCN |
| `DECISION_WINDOW_BARS` | number | `500` | no | Bars of the window a decision is computed on (at least 50): features normalise from its first bar | DCN |

## Financial Scraper — Market data

| Variable                   | Type    | Default                   | Required | Description                                                                 | Services |
| -------------------------- | ------- | ------------------------- | -------- | --------------------------------------------------------------------------- | -------- |
| `BINANCE_BASE_URL`         | URL     | `https://api.binance.com` | no       | Binance public REST API base URL (no account or API key, ADR-0026)          | FS       |
| `SYMBOLS_TO_TRACK`         | string  | `[]`                      | no       | Symbols to scrape, JSON array (`["BTCUSDT","ETHUSDT"]`) or CSV. Empty: no market data collected | FS       |
| `SCRAPE_INTERVAL`          | string  | `*/1 * * * *`             | no       | Cron expression of the scrape                                               | FS       |
| `SCRAPE_SCHEDULER_ENABLED` | boolean (`true`/`1`) | `true`       | no       | Runs the scrape cron in this instance; `false` on HTTP-only replicas (K8s runs a single cron instance) | FS       |
| `COLLECTOR_LEASE_NAME` | string | (empty) | no | Kubernetes Lease the collector pods compete for; only its holder runs the crons (ADR-0057). Set on `financial-scraper-collector` in K8s; empty (compose, dev): this instance collects | FS |
| `SIGNAL_COLLECTION_ENABLED` | boolean (`true`/`1`) | `true` | no | Collects the signal registry sources (ADR-0036) where the scrape cron runs; `false` in CI, which must not call the real sources | FS |
| `SIGNAL_REGISTRY_FILE` | string (path) | unset | no | Signal registry read at startup instead of the copy bundled in the image (issue #1308), checked by the same `parseSignalRegistry`: a broken file stops the pod. K8s: ConfigMap `financial-scraper-signal-registry` generated from `services/financial-scraper/src/config/signal-registry.json`, mounted at `/etc/signal-registry` by both Deployments; compose: bind mount of the same file. Read once: a change rolls the pods (ConfigMap hash), never a hot reload | FS |
| `SIGNAL_CONTACT_EMAIL` | string (e-mail) | empty | no | Contact e-mail in the User-Agent of the signal sources (SEC EDGAR answers 403 without one); must be a functional, non-nominative address (project alias, no personal data sent to the US sources, see data-processing-register.md); never committed: `.env` for compose, GitHub environment secret for K8s. A value that is no e-mail disables the signal collection only | FS |
| `SIGNAL_NON_COMMERCIAL_ACCEPTED` | string (comma-separated ids) | empty | no | Ids of `non-commercial` signal sources (ADR-0075) the operator accepts to collect. In production, financial-scraper refuses to start while such a source is active (its `SIGNAL_KEY_*` set) and not listed; elsewhere only a `warn` | FS |
| `SIGNAL_KEY_<SOURCE>` | string (API key) | unset | no | Free API key of one signal source (`accessPolicy.auth.env` of its registry entry, prefix `SIGNAL_KEY_` required, one variable per source), sent in the header or query parameter the entry declares; never in the registry, a log or an error. Unset: the source alone is not scheduled, a warning is logged and `fs_signal_source_disabled{source,reason="missing_key"}` is 1. Add it as an optional `secretKeyRef` of the collector (K8s) and in `.env.example` / `docker-compose.yml` with the source that needs it; used by `fred-us-macro` (`SIGNAL_KEY_FRED`) `eia-weekly-energy` (`SIGNAL_KEY_EIA`, free registration at eia.gov/opendata/register.php) and `twelvedata-daily-prices` (`SIGNAL_KEY_TWELVEDATA`, ADR-0080) | FS |

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

---

## Message bus (library, ADR-0073)

No broker service: every service that publishes or consumes links the library and talks to Redis (`REDIS_SENTINELS` / `REDIS_URL`, required: the service refuses to start without them), accepted messages in a Redis Streams journal (AOF on), dead letters in dead streams ([ADR-0048](../adr/0048-durable-message-journal-in-redis-streams.md)).

| Variable                  | Type   | Default                     | Required             | Description                                                                 | Services |
| ------------------------- | ------ | --------------------------- | -------------------- | --------------------------------------------------------------------------- | -------- |
| `JOURNAL_MIN_REPLICAS`    | number | `0`                         | no                   | Redis replicas that must hold an accepted message before the publish resolves (`WAIT`); 0 on a single node (compose, K8s staging), 1 in K8s production (Sentinel) | AL, TT, ME, RX |

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
| `RETENTION_ORDER_BOOKS_DAYS` | number (≥1) | `RETENTION_DAYS` | no       | Same for `market_order_books` (column `timestamp`); the K8s CronJob sets 180 (ADR-0053) | retention job |
| `RETENTION_TRADES_DAYS` | number (≥1) | `RETENTION_DAYS` | no       | Same for `market_trades` (column `timestamp`; a 100-trade sample per minute); the K8s CronJob sets 180 | retention job |
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

One user per client, created by `deploy/mongo/users.js` (K8s Job `mongo-audit-users`, compose `mongo-users`). K8s: keys of Secret `trading-model-secrets`, all checked by `deploy.yml`. Compose: `.env` (characters `[A-Za-z0-9_.-]`, all required).

| Variable | Type | Default | Required | Description | Services |
| -------- | ---- | ------- | -------- | ----------- | -------- |
| `MONGO_USERNAME` | string | — | no | MongoDB user of the service (`audit-logger`); unset: no authentication (dev). Set together with `MONGO_PASSWORD` | AL |
| `MONGO_PASSWORD` | string | — | no | Its password (Secret key `MONGO_AUDIT_PASSWORD`); the URI then carries `authSource=admin` and no credentials | AL |
| `MONGO_ROOT_PASSWORD` | string | — | **yes** | User `root`: restore, user administration | mongo pods, `mongo-users` |
| `MONGO_BACKUP_PASSWORD` | string | — | **yes** | User `backup`: dumps and oplog archives | mongo pods, `mongo-users` |
| `MONGO_AUDIT_PASSWORD` | string | — | **yes** | User `audit-logger` | audit-logger, `mongo-users` |
| `MONGO_AUDIT_KEYFILE` | string (6 to 1024 base64 characters) | — | **yes** in K8s | Internal authentication key of `mongo-audit` | mongo-audit pods |

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

Read by `@trading-model/persistence` (`mongo-utils`) when the caller passes no pool size. Only audit-logger depends on it.

| Variable          | Type   | Default | Required | Description                  | Services |
| ----------------- | ------ | ------- | -------- | ---------------------------- | -------- |
| `MONGO_POOL_SIZE` | number | `50`    | no       | MongoDB connection pool size | AL       |

---

## DLQ import (release N+1 of ADR-0073, one-off)

Read only by `dlq-cli import-mongo` of audit-logger, run once against the old `mongo-dlq` ([release runbook](../contributing/release.md#one-off-mongodb-dlq-import)); the CLI subcommand goes in the release after.

| Variable | Type | Default | Required | Description | Services |
| -------- | ---- | ------- | -------- | ----------- | -------- |
| `MONGO_DLQ_URI` | string | — | for `import-mongo` | MongoDB URI of the old `mongo-dlq` replica set | AL (CLI) |
| `MONGO_DLQ_USERNAME` | string | — | no | User `dlq-service` of that replica set | AL (CLI) |
| `MONGO_DLQ_PASSWORD` | string | — | no | Its password (old Secret key `MONGO_DLQ_PASSWORD`) | AL (CLI) |
| `MONGO_DLQ_DB` | string | `dlq` | no | Database holding `dlq_entries` | AL (CLI) |

---

## Docker Compose (`.env` file on host)

| Variable              | Type   | Default                 | Description                        | Services |
| --------------------- | ------ | ----------------------- | ---------------------------------- | -------- |
| `SCRAPER_PORT`        | number | `8445`                  | Host port for financial-scraper    | DC       |
| `TRAINER_PORT`        | number | `8446`                  | Host port for trader-trainer       | DC       |
| `GATEWAY_PORT`        | number | `8448`                  | Host port for api-gateway          | DC       |
| `AUDIT_PORT`          | number | `8450`                  | Host port for audit-logger         | DC       |
| `EDGE_PORT`           | number | `8449`                  | Host port for edge-proxy (HTTP)    | DC       |
| `EDGE_LIMIT_KEY_INC`  | path   | `./deploy/edge-proxy/edge-limit-key.inc` | Edge rate-limit key file; `edge-limit-key.off.inc` disables the limit for k6 load runs | DC |
| `MYSQL_ROOT_PASSWORD` | string | (required)              | MySQL root password                | DC       |
| `MYSQL_USER`          | string | `scraper`               | MySQL application user (rights on `MYSQL_DATABASE` only) | DC |
| `MYSQL_PASSWORD`      | string | (required)              | Password of `MYSQL_USER`           | DC       |
| `GRAFANA_PASSWORD`    | string | (required)              | Grafana admin password             | DC       |
| `GRAFANA_OIDC_ENABLED` | string | `false` (compose), unset (K8s) | `true` turns on Grafana OIDC login and hides the local login form (`GF_AUTH_DISABLE_LOGIN_FORM`, K8s); off otherwise (ADR-0063) | DC, K8s |
| `GRAFANA_ALLOWED_CIDRS` | string | unset | GitHub environment variable (K8s): comma-separated CIDRs, set by `deploy-release.sh render` as `whitelist-source-range` of `grafana-ingress`; `deploy.yml` refuses production without it (issue #1630) | K8s |
| `GRAFANA_BASIC_AUTH_ENABLED` | string | unset (K8s) | Set `false` together with `GRAFANA_OIDC_ENABLED=true`: refuses `Authorization: Basic` on the public Ingress (`GF_AUTH_BASIC_ENABLED`); unset keeps Grafana's default (on). Break-glass: `runbook-grafana-break-glass.md` | K8s |
| `GRAFANA_OIDC_CLIENT_ID` | string | (unset) | OIDC client id (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_CLIENT_SECRET` | string | (unset) | OIDC client secret (K8s: key of `trading-model-secrets`) (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_AUTH_URL` | string | (unset) | OIDC authorization endpoint (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_TOKEN_URL` | string | (unset) | OIDC token endpoint (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_API_URL` | string | (unset) | OIDC userinfo endpoint (ADR-0063) | DC, K8s |
| `GRAFANA_OIDC_ALLOWED_DOMAINS` | string | (unset) | E-mail domains allowed to log in; required in production K8s (ADR-0063) | DC, K8s |
| `GRAFANA_ROOT_URL` | string | `http://localhost:3000/` (compose) | Public Grafana URL, base of the OIDC `redirect_uri`; K8s: `https://grafana.<host>/` of the ingress (ADR-0063) | DC, K8s |
| `MYSQL_EXPORTER_PASSWORD` | string | (required)          | Password of the read-only MySQL user `exporter` of mysqld-exporter (ADR-0056) | DC |
| `MONGO_ROOT_PASSWORD`, `MONGO_EXPORTER_PASSWORD`, `MONGO_BACKUP_PASSWORD`, `MONGO_AUDIT_PASSWORD` | string | (required) | MongoDB users (ADR-0067), see "MongoDB users" above | DC |
| `MYSQL_DATABASE`      | string | `financial_scraper`     | MySQL database name                | DC       |
| `IMAGE_REGISTRY`      | string | `ghcr.io/trading-model` | Container registry prefix          | DC       |
| `IMAGE_TAG`           | string | `latest`                | Image tag to pull                  | DC       |
| `APP_VERSION`         | string | `1.0.0`                 | Version tag for Docker images      | DC       |
| `INSTANCE_ID`         | string | `instance-1`            | Instance identifier for deployment | DC       |

---

## Deploy workflow (GitHub environment variables)

| Variable | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| `BACKUP_S3_SECONDARY_BUCKET` (+ `_REGION`, `_ENDPOINT`, `_PROVIDER`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`) | `s3://bucket/prefix` + store settings | unset | Second off-site backup bucket at another provider: when set, `upload_offsite` sends it every file sent to `BACKUP_S3_BUCKET` (same tiers, metric `component="offsite-secondary"`), and `deploy.yml` checks it like the first (`scripts/backup-bucket-check.sh`). GitHub environment variables / secrets of the same names; `deploy.yml` writes them to the Secret `trading-model-backup-s3`. Unset: production deploy fails (`scripts/backup-config-check.sh`), warning elsewhere |
| `BACKUP_S3_SECONDARY_CHECK` | `warn` | unset | `warn` turns the production error of `scripts/backup-config-check.sh` for a missing second off-site bucket into a warning (emergency deploy); remove it once `BACKUP_S3_SECONDARY_BUCKET` is set. GitHub environment variable |
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
MYSQL_DATABASE=financial_scraper

# Trader-Trainer
TRAINER_SYMBOLS=BTCUSDT,ETHUSDT
TRAINER_SYMBOL_ASSETS=
TRAINER_ASSETS=
TRAINER_ASSET_COSTS={}
TRAINER_SIGNAL_FEATURES=
FEATURE_SIGNAL_INPUTS=false
FEATURE_INPUT_MASK_GENE=false
FEATURE_SHARED_TRUNK=false
TRAINER_INPUT_MASK_PROTECT_CANDLE=false
TRAINER_DATA_WINDOW=500
TRAINER_VALIDATION_SPLIT=0.15
TRAINER_TEST_SPLIT=0.15
TRAINER_GENERATIONS=50
TRAINER_POPULATION_SIZE=20
TRAINER_TIME_BUDGET_MS=300000
TRAINER_INTERVAL_MS=14400000
TRAINER_MAX_DATA_AGE_MS=900000
TRAINER_EPISODES_PER_INDIVIDUAL=10
TRAINER_FITNESS_TYPE=total_pnl
TRAINER_OBSERVE_POSITION=true

# API Gateway auth
AUTH_TOKENS=ops-alice:read:token1,grafana:read:token2
```

> **Never commit the `.env` file.** It is in `.gitignore`. Use `.env.example` as a template.
