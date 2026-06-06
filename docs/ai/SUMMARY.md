# Trading Model — AI Summary

## 1. Identity

- **name:** trading-model
- **version:** 1.2.0
- **license:** PolyForm Noncommercial 1.0.0
- **type:** monorepo (npm workspaces: packages/\*, services/\*)
- **lang:** TypeScript 6.0.3 (strict, target ES2020, commonjs modules)
- **runtime:** Node.js 20+ (alpine in Docker)
- **format:** Prettier (semi, singleQuote, printWidth 100, arrowParens: avoid, trailingComma: es5, tabWidth: 2, lf)
- **lint:** ESLint 10 flat config (tseslint recommended, ignores dist/spec/jest/fixtures/helpers/typedoc)
- **root scripts:** test, test:coverage, build, lint, commit, release, docs:generate

## 2. Repo Structure

```
trading-model/
├── packages/          # shared libs (3)
├── services/          # microservices (4)
├── docs/              # markdown docs + typedoc
├── scripts/           # tooling (8 files)
├── .github/           # workflows + templates
├── certs/             # TLS (gitignored)
├── .husky/            # git hooks
├── .env / .env.example
├── docker-compose.yml
├── commitlint.config.mjs
├── eslint.config.mjs
├── .prettierrc
├── .gitignore / .dockerignore
├── package.json
└── LICENSE.md
```

## 3. Packages

### @trading-model/common (v1.0.0)

- **source files:** 22 (`src/config/*`, `src/middleware/*`, `src/utils/*`, `src/server/*`, `src/validation/*`, `src/contracts/*`, `src/crypto/*`)
- **exports:** sub-path via `exports` map (`./config/*`, `./middleware/*`, `./utils/*`, `./server/*`, `./validation/*`, `./contracts/*`, `./crypto/*`)
- **key exports:**
  - `Logger` (singleton, log levels: error/warn/info/debug)
  - `createBootstrap()` (express app factory with mTLS, helmet, rate-limit)
  - `createSecureServer()` (HTTPS server with TLS config)
  - `HttpClient` (axios-based with cert auth)
  - `BaseEnvSchema` (Zod: NODE_ENV, PORT, TLS_KEY/CERT/CA_PATH, LOG_LEVEL)
  - `AddressManagerEnvSchema` (extends Base: APP_NAME/VER, SERVICE_NAME, INSTANCE_ID, CACHE_TTL_MS, PING_TIMEOUT, TOKEN/TTL_REFRESH_INTERVAL, ADDRESS_MANAGER_URL, ERROR_URL_WEBHOOK, MESSAGE_BUS_INIT/SHUTDOWN_TIMEOUT, MESSAGE_CALLBACK_PATH)
  - `catchSync()` / `ResponseException` / `HTTP_CODE` / `ResponseCodes`
  - `EventMap` (8 event message keys: test, example, recentTrades, 24hrTicker, candles, orderBook, priceTicker, orderBookTicker)
  - `EnumEventMessage` (event name constants)
  - `ServiceInstanceName` (well-known: discovery-service, financial-scrapper-service, message-delivery-service, trader-training-service, etc.)
  - `DeliveryMode` (AT_MOST_ONCE, AT_LEAST_ONCE, EXACTLY_ONCE)
  - `sleep()`, `prng` (seeded RNG)
- **deps:** express 5, helmet, zod 4, express-rate-limit, chained-error
- **test coverage threshold:** 100% all metrics

### @trading-model/address-manager (v1.0.0)

- **source files:** 15
- **class `AddressManager(config)`**
  - `start()` → `{stop}` — registers service, starts token refresh + TTL refresh schedulers
  - `findService(name)` → `ServiceInstance` — cached discovery with health check
  - `getToken()` → `string` — current HMAC instance token
  - `listenExpress(app)` — mounts ping routes
- **factory:** `createAddressManager(env)` — reads env vars
- **internal:** ServiceDiscovery, TokenManager, ServiceCache, ServiceHealthChecker, ServiceLocator, ServiceNameLocator, IpAddressLocator, MappingServiceLocator, RefreshJob, Scheduler
- **deps:** common, express 5, node-cron
- **test coverage threshold:** 80% all metrics

### @trading-model/broker-message (v1.0.0)

- **source files:** 11
- **class `MessageManagerClient(config)`**
  - `intents(topics)` — subscribe to event topics
  - `stopMessageManager()` — unsubscribe + cleanup
  - `on(event, listener)` — register event handler (via EventManager)
  - `listenExpress(app)` — mount callback route
  - `post.direct(service, payload, metadata)` — direct service message
  - `post.indirect(payload, metadata)` — async broker publish
- **helper:** `MessageMetadata` (MetadataBuilder: topic, eventType, causationId, routing, correlationId, publisher, security, deliveryMode, schemaVersion)
- **validators:** `MessageMetadataSchema` (Zod), `MessagePayloadSchema` (Zod)
- **deps:** common, address-manager, express 5, zod 4
- **test coverage threshold:** 80% all metrics

## 4. Services

### discovery-server (port 8443)

- **service name:** `discovery-service`
- **routes:**
  | Method | Path | Description |
  |--------|------|-------------|
  | POST | /register | Register instance (HMAC-SHA256 token issued) |
  | POST | /heartbeat | Renew lease |
  | POST | /token/rotate | Rotate instance token |
  | GET | /services | List all registered services |
  | GET | /services/:name | List instances by service name |
  | GET | /services/:name/:id | Get specific instance |
- **auth:** HMAC-SHA256 via `x-instance-token` header
- **storage:** in-memory registry (TTL lease eviction via CLEANUP_SERVICE_INTERVAL_MS, default 10min)
- **deps:** common, axios, express 5, helmet, express-rate-limit, zod 4
- **env extra:** CLEANUP_SERVICE_INTERVAL_MS, ERROR_URL_WEBHOOK
- **test coverage threshold:** 100% all metrics

### message-manager (port 8444)

- **service name:** `message-delivery-service`
- **routes:**
  | Method | Path | Description |
  |--------|------|-------------|
  | POST | /message | Publish message |
  | POST | /subscription | Subscribe to topics |
  | DELETE | /subscription | Unsubscribe |
- **delivery modes:** AT_MOST_ONCE, AT_LEAST_ONCE, EXACTLY_ONCE
- **storage:** MongoDB 7 (connection: `MONGODB_URI`)
- **features:** TTL expiration, DLQ (dead-letter queue), Zod validation
- **internal:** Broker, Dispatcher, Message, Subscription
- **deps:** common, address-manager, mongodb 7, express 5, axios, helmet, express-rate-limit, zod 4
- **test coverage threshold:** 100% all metrics

### financial-scraper (port 8445)

- **service name:** `financial-scrapper-service`
- **data source:** Binance (REST API)
- **persistence:** MySQL 8 via mysql2 + ts-sql-query
- **tables:** `market_candles`, `market_trades`, `market_tickers` (see `scripts/init-db.sql`)
- **background:** node-cron per symbol, p-limit concurrency
- **rate limit:** token-bucket, exponential backoff retry
- **routes (GET):**
  - `/trade/:symbol`, `/ticker/:symbol`, `/candles/:symbol`, `/orderbook/:symbol`, `/heartbeat/:symbol`
- **deps:** common, address-manager, broker-message, mysql2, ts-sql-query, node-cron, p-limit, uuid, axios, express 5, helmet, express-rate-limit
- **env extra:** DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, DB_PORT (from docker-compose; not in Zod schema — read directly from process.env)
- **test coverage threshold:** 100% all metrics

### trader-trainer (port 8446)

- **service name:** `trader-training-service`
- **algorithm:** genetic algorithm + neural network (custom TS implementation)
  - GA: genome, population, selection, crossover, mutation, fitness, pareto, diversity, adaptive control
  - NN: activation (relu/tanh/sigmoid/leakyRelu/linear/softmax), initializers, losses (mse/mae/bce/huber), optimizer (sgd/adam/adagrad/rmsprop), normalize, agent
- **subscription:** 6 market event topics — TRADE, TICKER, CANDLE, ORDER_BOOK, PRICE_TICKER, BOOK_TICKER
- **training loop:** every 60s per symbol (node-cron)
- **env vars:** `TRAINER_SYMBOLS`, `TRAINER_DATA_WINDOW`, `TRAINER_VALIDATION_SPLIT`, `TRAINER_GENERATIONS`, `TRAINER_POPULATION_SIZE`, `TRAINER_TIME_BUDGET_MS`, `TRAINER_EPISODES_PER_INDIVIDUAL` + all address-manager vars
- **deps:** common, address-manager, broker-message, express 5, helmet, zod 4
- **test coverage threshold:** not set (no coverage config in jest.config.js)

## 5. Dependency Graph

```
common ← address-manager ← broker-message ← financial-scraper
common ← discovery-server                    ← trader-trainer
                                             ← message-manager
```

- discovery-server depends ONLY on common
- mTLS enforced at every inter-service hop

## 6. Ports

| Service           | Host Port | Container Port |
| ----------------- | --------- | -------------- |
| discovery-server  | 8443      | 3000           |
| message-manager   | 8444      | 3000           |
| financial-scraper | 8445      | 3000           |
| trader-trainer    | 8446      | 3000           |

TLS certs mounted at `/certs:ro` (from `TLS_CERTS_DIR` env, default `./certs`)

## 7. Docker

- **multi-stage build:** deps → build → runtime
- **base image:** `node:20-alpine` with tini init
- **container images:** `ghcr.io/trading-model/<service-name>`
- **docker-compose:** 6 services (mongo, mysql, discovery-server, message-manager, financial-scraper, trader-trainer) on `trading-network` bridge
- **healthchecks:** every service, using curl over HTTPS with client certs
- **volumes:** `mongo-data` (MongoDB 7), `mysql-data` (MySQL 8)

## 8. Databases

- **MongoDB 7** — message-manager persistence, `MONGODB_URI: mongodb://mongo:27017/message-manager`
- **MySQL 8** — financial-scraper persistence, database `financial_scraper`, tables: market_candles, market_trades, market_tickers
- Data persisted via named volumes

## 9. CI/CD

### ci.yml

- **trigger:** push, pull_request
- **permissions:** contents: read
- **jobs:** lint (npm ci → lint), test (npm ci → build → test:coverage)

### release.yml

- **trigger:** tag v\*.\*.\*
- **permissions:** quality — contents:read; docker — contents:read + packages:write; release — contents:write
- **jobs:**
  1. quality: lint + build + test:coverage → extract version
  2. docker: buildx + push to ghcr.io (4 images, semver + sha tags) — depends on quality
  3. release: GitHub Release with auto-generated notes — depends on quality + docker

## 10. Commit Convention

- **format:** `:emoji:(scope): subject`
- **enforced by:** commitlint + husky (`commit-msg` hook)
- **scopes:** auth, scraper, api, wallet, core, deps, discovery, broker, trainer, router, common, config, database, middleware, utils, types, address-manager, message-manager, financial-scraper, trader-trainer, discovery-server, docs, github-actions, husky, eslint
- **hooks:** pre-commit (prettier --check, eslint), pre-push (test, build)

## 11. Environment Variables

| Category            | Variables                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Base**            | NODE_ENV, PORT, TLS_KEY_PATH, TLS_CERT_PATH, TLS_CA_PATH, LOG_LEVEL                                                                                                                                                                                                      |
| **Address-manager** | APP_NAME, APP_VERSION, SERVICE_NAME, INSTANCE_ID, CACHE_TTL_MS, SERVICE_PING_TIMEOUT_MS, TOKEN_REFRESH_INTERVAL_MS, TTL_REFRESH_INTERVAL_MS, ADDRESS_MANAGER_URL, ERROR_URL_WEBHOOK, MESSAGE_BUS_INIT_TIMEOUT_MS, MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS, MESSAGE_CALLBACK_PATH |
| **Discovery**       | CLEANUP_SERVICE_INTERVAL_MS                                                                                                                                                                                                                                              |
| **Trader-trainer**  | TRAINER_SYMBOLS, TRAINER_DATA_WINDOW, TRAINER_VALIDATION_SPLIT, TRAINER_GENERATIONS, TRAINER_POPULATION_SIZE, TRAINER_TIME_BUDGET_MS, TRAINER_EPISODES_PER_INDIVIDUAL                                                                                                    |
| **Scraper DB**      | DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, DB_PORT (read directly from process.env, not Zod)                                                                                                                                                                                |
| **Docker compose**  | DISCOVERY_PORT, MESSAGE_PORT, SCRAPER_PORT, TRAINER_PORT, TLS_CERTS_DIR, MYSQL_ROOT_PASSWORD, MYSQL_DATABASE                                                                                                                                                             |

## 12. Testing

- **framework:** Jest 30 + ts-jest 29
- **structure:** `tests/unit/`, `tests/integration/`, `tests/fixtures/`, `tests/helpers/`
- **naming:** `*.spec.ts`
- **coverage thresholds:**
  | Module | Branches | Functions | Lines | Statements |
  |--------|----------|-----------|-------|------------|
  | common | 100 | 100 | 100 | 100 |
  | address-manager | 80 | 80 | 80 | 80 |
  | broker-message | 80 | 80 | 80 | 80 |
  | discovery-server | 100 | 100 | 100 | 100 |
  | message-manager | 100 | 100 | 100 | 100 |
  | financial-scraper | 100 | 100 | 100 | 100 |
  | trader-trainer | not set | not set | not set | not set |

## 13. Security

- **mTLS:** enforced at every inter-service hop (server cert verification, client cert authentication)
- **HMAC-SHA256:** instance tokens for service registration auth
- **Zod env validation:** fail-fast (process.exit(1) on invalid env)
- **no secrets in repo:** .env gitignored, sensitive files in certs/ gitignored, _.pem/_.crt/\*.key gitignored
- **Dependabot:** active (implicit via GitHub)

## 14. Documentation

- **`docs/standards/` (10 files):** ARCHITECTURE, README, QUALITY, TESTING, SECURITY, CI_CD, PR, COMMIT, DOCUMENTATION, WRITING
- **`docs/deployment/` (8 files):** SETUP, ENV, DATABASE, DEPLOY, CONTRIBUTE, DOCKER, CI_CD, README
- **`docs/architecture/api/` (8 files):** common, address-manager, broker-message, discovery-server, message-manager, financial-scraper, trader-trainer, README
- **`docs/architecture/code/`:** TypeDoc-generated HTML per module (common, address-manager, message-manager, financial-scraper, trader-trainer)
- **`docs/architecture/code/@trading-model/`:** TypeDoc-generated docs for common, address-manager, broker-message
- **`docs/architecture/api/`:** API docs for common.md, address-manager.md, broker-message.md

## 15. Scripts

| Script                      | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `scripts/commit.mjs`        | Interactive gitmoji commit helper                 |
| `scripts/release.mjs`       | Changelog generation + version bump (+ --dry-run) |
| `scripts/generate-docs.mjs` | TypeDoc runner (+ --dry-run)                      |
| `scripts/deploy-beta.ps1`   | Canary deploy (Windows)                           |
| `scripts/deploy-beta.sh`    | Canary deploy (Unix)                              |
| `scripts/generate-certs.sh` | TLS certificate generation                        |
| `scripts/hosts.json`        | Fleet inventory for beta deployment               |
| `scripts/init-db.sql`       | MySQL schema (3 tables)                           |

Deploy config: canary 2%, error threshold 5%, health retries 3, interval 10s, monitor 30min, branch dev→stable.
