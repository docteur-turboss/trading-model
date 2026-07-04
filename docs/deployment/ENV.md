# Environment Variables

Service abbreviation legend:

| Abbr. | Service                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| All   | All services (discovery-server, message-manager, financial-scraper, trader-trainer, etc.)           |
| All*  | All services except admin-interface (nginx — no TLS)                                                |
| DS    | discovery-server                                                                                    |
| MM    | message-manager                                                                                     |
| FS    | financial-scraper                                                                                   |
| TT    | trader-trainer                                                                                      |
| CA    | certificate-authority                                                                               |
| GW    | api-gateway                                                                                         |
| AL    | audit-logger                                                                                        |
| DLQ   | dlq-service                                                                                         |
| ADM   | admin-interface                                                                                     |
| DC    | docker-compose.yml (host-side `.env` file)                                                          |

---

## Common — all services (except admin-interface)

Defined in `@trading-model/common` (`BaseEnvSchema`).

| Variable        | Type                                           | Default                 | Required | Description                   | Services |
| --------------- | ---------------------------------------------- | ----------------------- | -------- | ----------------------------- | -------- |
| `NODE_ENV`      | `development \| test \| staging \| production` | `production`            | no       | Runtime environment           | All*     |
| `PORT`          | number                                         | `3000`                  | no       | Internal container HTTPS port | All*     |
| `TLS_KEY_PATH`  | string                                         | `/certs/server-key.pem` | **yes**  | Path to TLS private key (PEM) | All*     |
| `TLS_CERT_PATH` | string                                         | `/certs/server.crt`     | **yes**  | Path to TLS certificate (PEM) | All*     |
| `TLS_CA_PATH`   | string                                         | `/certs/ca.crt`         | **yes**  | Path to CA certificate (PEM)  | All*     |
| `LOG_LEVEL`     | `error \| warn \| info \| debug`               | `info`                  | no       | Logging verbosity             | All*     |

---

## Address Manager — registered services

Used by services that register with the discovery-server.

Defined in `@trading-model/common` (`AddressManagerEnvSchema`).

| Variable                          | Type   | Default                         | Required | Description                                      | Services       |
| --------------------------------- | ------ | ------------------------------- | -------- | ------------------------------------------------ | -------------- |
| `APP_NAME`                        | string | _varies_                        | **yes**  | Logical application name                         | MM, FS, TT, CA, AL, DLQ |
| `APP_VERSION`                     | string | `1.0.0`                         | no       | Application version                              | MM, FS, TT, CA, AL, DLQ |
| `SERVICE_NAME`                    | string | _varies_                        | **yes**  | Service identity registered in discovery         | MM, FS, TT, CA, AL, DLQ |
| `INSTANCE_ID`                     | string | _varies_                        | **yes**  | Unique instance identifier                       | MM, FS, TT, CA, AL, DLQ |
| `CACHE_TTL_MS`                    | number | `30000`                         | no       | In-memory cache TTL                              | MM, FS, TT, CA, AL, DLQ |
| `SERVICE_PING_TIMEOUT_MS`         | number | `2000`                          | no       | Timeout for health check pings                   | MM, FS, TT, CA, AL, DLQ |
| `TOKEN_REFRESH_INTERVAL_MS`       | number | `60000`                         | no       | Auth token refresh interval                      | MM, FS, TT, CA, AL, DLQ |
| `TTL_REFRESH_INTERVAL_MS`         | number | `15000`                         | no       | Service lease TTL refresh interval               | MM, FS, TT, CA, AL, DLQ |
| `ADDRESS_MANAGER_URL`             | URL    | `https://discovery-server:3000` | **yes**  | Discovery server base URL                        | MM, FS, TT, CA, AL, DLQ |
| `DNS_NAME_MAP`                    | string | `'{}'`                          | no       | Custom DNS name to address mapping (JSON object) | MM, FS, TT, CA, AL, DLQ |
| `ERROR_URL_WEBHOOK`               | URL    | _(empty)_                       | no       | Error notification webhook endpoint              | MM, FS, TT, DS, CA, AL, DLQ |
| `MESSAGE_BUS_INIT_TIMEOUT_MS`     | number | `5000`                          | no       | Message bus client init timeout                  | MM, FS, TT, CA, AL, DLQ |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | number | `5000`                          | no       | Message bus client shutdown timeout              | MM, FS, TT, CA, AL, DLQ |
| `MESSAGE_CALLBACK_PATH`           | string | `message`                       | no       | Callback path for incoming messages              | MM, FS, TT, CA, AL, DLQ |

---

## Discovery Server

| Variable                      | Type   | Default          | Required | Description                        | Services |
| ----------------------------- | ------ | ---------------- | -------- | ---------------------------------- | -------- |
| `CLEANUP_SERVICE_INTERVAL_MS` | number | `600000` (10min) | no       | Interval for expired lease cleanup | DS       |
| `ERROR_URL_WEBHOOK`           | URL    | —                | no       | Error notification webhook         | DS       |
| `REDIS_URL`                   | string | —                | no       | Redis URL for distributed registry | DS       |
| `REDIS_KEY_PREFIX`            | string | `discovery:`     | no       | Redis key prefix per region        | DS       |
| `REGION`                      | string | —                | no       | Deployment region (multi-region)   | DS       |

---

## Certificate Authority

| Variable                    | Type   | Default           | Required | Description                              | Services |
| --------------------------- | ------ | ----------------- | -------- | ---------------------------------------- | -------- |
| `MONGODB_URI`               | string | `mongodb://mongo:27017/certificate-authority` | **yes**  | MongoDB connection URI    | CA       |
| `CA_KEY_PATH`               | string | `/etc/ca-keys/ca-key.pem` | **yes**  | CA private key path                | CA       |
| `CA_CERT_TTL_MS`            | number | `31536000000` (1y)| no       | Validity duration for CA-signed certs    | CA       |
| `CERT_ROTATION_INTERVAL_MS` | number | `86400000` (1d)   | no       | Interval between certificate rotation checks | CA |
| `CERT_ROTATION_MARGIN_MS`   | number | `17280000` (~4.8h)| no       | Renewal margin before certificate expiry | CA       |
| `CERT_DEFAULT_TTL_MS`       | number | `604800000` (7d)  | no       | Default TTL for issued certificates      | CA       |
| `CERT_MAX_TTL_MS`           | number | `31536000000` (1y)| no       | Maximum allowed TTL for issued certs   | CA       |
| `DISCOVERY_SERVICE_URL`     | URL    | `https://discovery-server:3000` | **yes**  | Discovery server URL      | CA       |

---

## API Gateway

| Variable              | Type   | Default                          | Required | Description                     | Services |
| --------------------- | ------ | -------------------------------- | -------- | ------------------------------- | -------- |
| `DISCOVERY_SERVICE_URL` | URL  | `https://discovery-server:3000`  | **yes**  | Discovery server URL            | GW       |
| `RATE_LIMIT_WINDOW_MS` | number | `60000`                         | no       | Rate limit window (ms)          | GW       |
| `RATE_LIMIT_MAX`      | number | `100`                            | no       | Max requests per window         | GW       |
| `CACHE_TTL_MS`        | number | `30000`                          | no       | Cache TTL for proxied responses | GW       |
| `AUTH_TOKEN_HEADER`   | string | `x-api-key`                      | no       | Header name for auth token      | GW       |
| `AUTH_TOKENS`         | string | —                                | **yes**  | Comma/whitespace-separated valid tokens | GW |
| `PROXY_TIMEOUT_MS`    | number | `10000`                          | no       | Proxy request timeout           | GW       |

---

## Trader Trainer

| Variable                          | Type         | Default           | Required | Description                          | Services |
| --------------------------------- | ------------ | ----------------- | -------- | ------------------------------------ | -------- |
| `TRAINER_SYMBOLS`                 | string       | `BTCUSDT,ETHUSDT` | no       | Comma-separated trading symbols      | TT       |
| `TRAINER_DATA_WINDOW`             | number       | `500`             | no       | Data window size (inputs per step)   | TT       |
| `TRAINER_VALIDATION_SPLIT`        | number (0-1) | `0.2`             | no       | Fraction of data used for validation | TT       |
| `TRAINER_GENERATIONS`             | number       | `50`              | no       | Number of GA generations             | TT       |
| `TRAINER_POPULATION_SIZE`         | number       | `20`              | no       | GA population size                   | TT       |
| `TRAINER_TIME_BUDGET_MS`          | number       | `300000` (5min)   | no       | Max training time per run            | TT       |
| `TRAINER_EPISODES_PER_INDIVIDUAL` | number       | `3`               | no       | DRL episodes per genome evaluation   | TT       |

---

## Financial Scraper — Database

| Variable      | Type   | Default             | Required | Description                      | Services |
| ------------- | ------ | ------------------- | -------- | -------------------------------- | -------- |
| `DB_USER`     | string | `root`              | **yes**  | MySQL user                       | FS       |
| `DB_PASSWORD` | string | `changeme`          | **yes**  | MySQL password                   | FS       |
| `DB_NAME`     | string | `financial_scraper` | **yes**  | MySQL database name              | FS       |
| `DB_HOST`     | string | `mysql`             | no       | MySQL host (Docker service name) | FS       |
| `DB_PORT`     | number | `3306`              | no       | MySQL port                       | FS       |

---

## Message Manager — MongoDB

| Variable      | Type   | Default                                 | Required | Description            | Services |
| ------------- | ------ | --------------------------------------- | -------- | ---------------------- | -------- |
| `MONGODB_URI` | string | `mongodb://mongo:27017/message-manager` | no       | MongoDB connection URI | MM       |

---

## Audit Logger — MongoDB

| Variable      | Type   | Default                                 | Required | Description            | Services |
| ------------- | ------ | --------------------------------------- | -------- | ---------------------- | -------- |
| `MONGODB_URI` | string | `mongodb://mongo:27017/audit-logger`    | **yes**  | MongoDB connection URI | AL       |

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
| `DLQ_AUTH_HMAC_SECRET`       | string  | —                                    | no       | HMAC secret for auth (min 16 chars)  | DLQ      |
| `DLQ_AUTH_HMAC_SECRET_PATH`  | string  | —                                    | no       | Path to HMAC secret file             | DLQ      |
| `DLQ_ALLOWED_SERVICES`       | string  | `message-manager,admin`              | no       | Comma-separated allowed service names| DLQ      |
| `DLQ_PRUNE_INTERVAL_MS`      | number  | `60000`                              | no       | Interval for pruning expired entries | DLQ      |
| `DLQ_AUTO_RETRY_ENABLED`     | boolean | `false`                              | no       | Enable automatic retry of DLQ entries| DLQ      |
| `DLQ_AUTO_RETRY_INTERVAL_MS` | number  | `30000`                              | no       | Interval between auto-retry attempts | DLQ      |
| `DLQ_AUTO_RETRY_LIMIT`       | number  | `50`                                 | no       | Max auto-retry attempts per entry    | DLQ      |
| `REDIS_URL`                  | string  | —                                    | no       | Redis URL for rate limiting          | DLQ      |

---

## Admin Interface

| Variable            | Type   | Default                           | Required | Description                     | Services |
| ------------------- | ------ | --------------------------------- | -------- | ------------------------------- | -------- |
| `VITE_API_GATEWAY_URL` | URL  | `https://api-gateway:3000/v1`    | **yes**  | API Gateway URL for the SPA     | ADM      |
| `VITE_ADMIN_TOKEN`  | string | —                                 | **yes**  | Admin auth token for API calls  | ADM      |

---

## Docker Compose (`.env` file on host)

| Variable              | Type   | Default                 | Description                        | Services |
| --------------------- | ------ | ----------------------- | ---------------------------------- | -------- |
| `DISCOVERY_PORT`      | number | `8443`                  | Host port for discovery-server     | DC       |
| `MESSAGE_PORT`        | number | `8444`                  | Host port for message-manager      | DC       |
| `SCRAPER_PORT`        | number | `8445`                  | Host port for financial-scraper    | DC       |
| `TRAINER_PORT`        | number | `8446`                  | Host port for trader-trainer       | DC       |
| `CA_PORT`             | number | `8447`                  | Host port for certificate-authority| DC       |
| `GATEWAY_PORT`        | number | `8448`                  | Host port for api-gateway          | DC       |
| `ADMIN_PORT`          | number | `8449`                  | Host port for admin-interface      | DC       |
| `AUDIT_PORT`          | number | `8450`                  | Host port for audit-logger         | DC       |
| `DLQ_PORT`            | number | `8452`                  | Host port for dlq-service          | DC       |
| `TLS_CERTS_DIR`       | string | `./certs`               | Host TLS certificates directory    | DC       |
| `MYSQL_ROOT_PASSWORD` | string | `changeme`              | MySQL root password                | DC       |
| `MYSQL_DATABASE`      | string | `financial_scraper`     | MySQL database name                | DC       |
| `IMAGE_REGISTRY`      | string | `ghcr.io/trading-model` | Container registry prefix          | DC       |
| `IMAGE_TAG`           | string | `latest`                | Image tag to pull                  | DC       |
| `APP_VERSION`         | string | `1.0.0`                 | Version tag for Docker images      | DC       |
| `INSTANCE_ID`         | string | `instance-1`            | Instance identifier for deployment | DC       |
| `ADMIN_TOKEN`         | string | —                       | Auth token for admin-interface     | DC       |

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
CA_PORT=8447
GATEWAY_PORT=8448
ADMIN_PORT=8449
AUDIT_PORT=8450

# TLS certificates directory
TLS_CERTS_DIR=./certs

# MySQL
MYSQL_ROOT_PASSWORD=changeme
MYSQL_DATABASE=financial_scraper

# Trader-Trainer
TRAINER_SYMBOLS=BTCUSDT,ETHUSDT
TRAINER_DATA_WINDOW=500
TRAINER_VALIDATION_SPLIT=0.2
TRAINER_GENERATIONS=50
TRAINER_POPULATION_SIZE=20
TRAINER_TIME_BUDGET_MS=300000
TRAINER_EPISODES_PER_INDIVIDUAL=3

# API Gateway auth
ADMIN_TOKEN=change-me-in-production
AUTH_TOKENS=token1 token2

# Error webhook (optional)
ERROR_URL_WEBHOOK=
```

> **Never commit the `.env` file.** It is in `.gitignore`. Use `.env.example` as a template.
