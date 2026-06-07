# Environment Variables

Service abbreviation legend:

| Abbr. | Service                                                                             |
| ----- | ----------------------------------------------------------------------------------- |
| All   | All services (discovery-server, message-manager, financial-scraper, trader-trainer) |
| DS    | discovery-server                                                                    |
| MM    | message-manager                                                                     |
| FS    | financial-scraper                                                                   |
| TT    | trader-trainer                                                                      |
| DC    | docker-compose.yml (host-side)                                                      |

---

## Common — all services

Defined in `@trading-model/common` (`BaseEnvSchema`).

| Variable        | Type                                           | Default                 | Required | Description                   | Services |
| --------------- | ---------------------------------------------- | ----------------------- | -------- | ----------------------------- | -------- |
| `NODE_ENV`      | `development \| test \| staging \| production` | `production`            | no       | Runtime environment           | All      |
| `PORT`          | number                                         | `3000`                  | no       | Internal container HTTPS port | All      |
| `TLS_KEY_PATH`  | string                                         | `/certs/server-key.pem` | **yes**  | Path to TLS private key (PEM) | All      |
| `TLS_CERT_PATH` | string                                         | `/certs/server.crt`     | **yes**  | Path to TLS certificate (PEM) | All      |
| `TLS_CA_PATH`   | string                                         | `/certs/ca.crt`         | **yes**  | Path to CA certificate (PEM)  | All      |
| `LOG_LEVEL`     | `error \| warn \| info \| debug`               | `info`                  | no       | Logging verbosity             | All      |

---

## Address Manager — registered services

Used by `message-manager`, `financial-scraper`, and `trader-trainer` to register with the discovery-server.

Defined in `@trading-model/common` (`AddressManagerEnvSchema`).

| Variable                          | Type   | Default                         | Required | Description                                      | Services   |
| --------------------------------- | ------ | ------------------------------- | -------- | ------------------------------------------------ | ---------- |
| `APP_NAME`                        | string | _varies_                        | **yes**  | Logical application name                         | MM, FS, TT |
| `APP_VERSION`                     | string | `1.0.0`                         | no       | Application version                              | MM, FS, TT |
| `SERVICE_NAME`                    | string | _varies_                        | **yes**  | Service identity registered in discovery         | MM, FS, TT |
| `INSTANCE_ID`                     | string | _varies_                        | **yes**  | Unique instance identifier                       | MM, FS, TT |
| `CACHE_TTL_MS`                    | number | `30000`                         | no       | In-memory cache TTL                              | MM, FS, TT |
| `SERVICE_PING_TIMEOUT_MS`         | number | `2000`                          | no       | Timeout for health check pings                   | MM, FS, TT |
| `TOKEN_REFRESH_INTERVAL_MS`       | number | `60000`                         | no       | Auth token refresh interval                      | MM, FS, TT |
| `TTL_REFRESH_INTERVAL_MS`         | number | `15000`                         | no       | Service lease TTL refresh interval               | MM, FS, TT |
| `ADDRESS_MANAGER_URL`             | URL    | `https://discovery-server:3000` | **yes**  | Discovery server base URL                        | MM, FS, TT |
| `DNS_NAME_MAP`                    | string | `'{}'`                          | no       | Custom DNS name to address mapping (JSON object) | MM, FS, TT |
| `ERROR_URL_WEBHOOK`               | URL    | _(empty)_                       | **yes**  | Error notification webhook endpoint              | All        |
| `MESSAGE_BUS_INIT_TIMEOUT_MS`     | number | `5000`                          | no       | Message bus client init timeout                  | MM, FS, TT |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | number | `5000`                          | no       | Message bus client shutdown timeout              | MM, FS, TT |
| `MESSAGE_CALLBACK_PATH`           | string | `message`                       | no       | Callback path for incoming messages              | MM, FS, TT |

---

## Discovery Server

| Variable                      | Type   | Default          | Required | Description                        | Services |
| ----------------------------- | ------ | ---------------- | -------- | ---------------------------------- | -------- |
| `CLEANUP_SERVICE_INTERVAL_MS` | number | `600000` (10min) | no       | Interval for expired lease cleanup | DS       |
| `ERROR_URL_WEBHOOK`           | URL    | —                | **yes**  | Error notification webhook         | DS       |

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

## Docker Compose (`.env` file on host)

| Variable              | Type   | Default                 | Description                        | Services |
| --------------------- | ------ | ----------------------- | ---------------------------------- | -------- |
| `DISCOVERY_PORT`      | number | `8443`                  | Host port for discovery-server     | DC       |
| `MESSAGE_PORT`        | number | `8444`                  | Host port for message-manager      | DC       |
| `SCRAPER_PORT`        | number | `8445`                  | Host port for financial-scraper    | DC       |
| `TRAINER_PORT`        | number | `8446`                  | Host port for trader-trainer       | DC       |
| `TLS_CERTS_DIR`       | string | `./certs`               | Host TLS certificates directory    | DC       |
| `MYSQL_ROOT_PASSWORD` | string | `changeme`              | MySQL root password                | DC       |
| `MYSQL_DATABASE`      | string | `financial_scraper`     | MySQL database name                | DC       |
| `IMAGE_REGISTRY`      | string | `ghcr.io/trading-model` | Container registry prefix          | DC       |
| `IMAGE_TAG`           | string | `latest`                | Image tag to pull                  | DC       |
| `APP_VERSION`         | string | `1.0.0`                 | Version tag for Docker images      | DC       |
| `INSTANCE_ID`         | string | `instance-1`            | Instance identifier for deployment | DC       |

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

# Error webhook (optional)
ERROR_URL_WEBHOOK=
```

> **Never commit the `.env` file.** It is in `.gitignore`. Use `.env.example` as a template.
