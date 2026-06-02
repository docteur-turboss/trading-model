# Configuration Reference

All environment variables used across the project, grouped by scope.

---

## Common (all services)

These are defined in `@trading-model/common` (`BaseEnvSchema`).

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `NODE_ENV` | `development \| test \| staging \| production` | `development` | no | Runtime environment |
| `PORT` | number | `3000` | no | HTTPS server port (container internal) |
| `TLS_KEY_PATH` | string | — | **yes** | Path to TLS private key (PEM) |
| `TLS_CERT_PATH` | string | — | **yes** | Path to TLS certificate (PEM) |
| `TLS_CA_PATH` | string | — | **yes** | Path to CA certificate (PEM) |
| `LOG_LEVEL` | `error \| warn \| info \| debug` | `info` | no | Logging verbosity |

---

## Address Manager (services using service discovery: message-manager, financial-scraper, trader-trainer)

Defined in `@trading-model/common` (`AddressManagerEnvSchema`).

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `APP_NAME` | string | — | **yes** | Logical application name |
| `APP_VERSION` | string | `1.0.0` | no | Application version |
| `SERVICE_NAME` | string | — | **yes** | Service identity registered in discovery |
| `INSTANCE_ID` | string | — | **yes** | Unique instance identifier |
| `CACHE_TTL_MS` | number | `30000` | no | In-memory cache TTL |
| `SERVICE_PING_TIMEOUT_MS` | number | `2000` | no | Timeout for health check pings |
| `TOKEN_REFRESH_INTERVAL_MS` | number | `60000` | no | Auth token refresh interval |
| `TTL_REFRESH_INTERVAL_MS` | number | `15000` | no | Service lease TTL refresh interval |
| `ADDRESS_MANAGER_URL` | URL | — | **yes** | Discovery server base URL |
| `ERROR_URL_WEBHOOK` | URL | — | **yes** | Error notification webhook endpoint |
| `MESSAGE_BUS_INIT_TIMEOUT_MS` | number | `2000` | no | Message bus client init timeout |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | number | `2000` | no | Message bus client shutdown timeout |
| `MESSAGE_CALLBACK_PATH` | string | `message` | no | Callback path for incoming messages |

---

## Discovery Server (`discovery-server`)

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `CLEANUP_SERVICE_INTERVAL_MS` | number | `600000` (10min) | no | Interval for expired lease cleanup |
| `ERROR_URL_WEBHOOK` | URL | — | **yes** | Error notification webhook |

---

## Financial Scraper (`financial-scraper`)

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `DB_USER` | string | — | **yes** | MySQL user |
| `DB_PASSWORD` | string | — | **yes** | MySQL password |
| `DB_NAME` | string | — | **yes** | MySQL database name |
| `DB_HOST` | string | `localhost` | no | MySQL host |
| `DB_PORT` | number | `3306` | no | MySQL port |

---

## Trader Trainer (`trader-trainer`)

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `TRAINER_SYMBOLS` | string | `BTCUSDT,ETHUSDT` | no | Comma-separated trading symbols |
| `TRAINER_DATA_WINDOW` | number | `500` | no | Data window size (inputs per step) |
| `TRAINER_VALIDATION_SPLIT` | number (0-1) | `0.2` | no | Fraction of data used for validation |
| `TRAINER_GENERATIONS` | number | `50` | no | Number of GA generations |
| `TRAINER_POPULATION_SIZE` | number | `20` | no | GA population size |
| `TRAINER_TIME_BUDGET_MS` | number | `300000` (5min) | no | Max training time per run |
| `TRAINER_EPISODES_PER_INDIVIDUAL` | number | `3` | no | DRL episodes per genome evaluation |

---

## Docker Compose

These are consumed by `docker-compose.yml`, not by the services directly.

| Variable | Default | Description |
|---|---|---|
| `DISCOVERY_PORT` | `8443` | Host port for discovery-server |
| `MESSAGE_PORT` | `8444` | Host port for message-manager |
| `SCRAPER_PORT` | `8445` | Host port for financial-scraper |
| `TRAINER_PORT` | `8446` | Host port for trader-trainer |
| `TLS_CERTS_DIR` | `./certs` | Host directory mounted as `/certs` in containers |
| `MYSQL_ROOT_PASSWORD` | `changeme` | MySQL root password |
| `MYSQL_DATABASE` | `financial_scraper` | MySQL database name |
| `IMAGE_REGISTRY` | `ghcr.io/trading-model` | Container registry prefix |
| `IMAGE_TAG` | `latest` | Image tag to pull |

---

## Validation

All environment variables are validated at startup via **Zod schemas**. If a
required variable is missing or has an invalid value, the service exits
immediately with a clear error message.

Example error:

```
❌ Invalid environment configuration
TLS_KEY_PATH: Required
```

This guarantees fail-fast behavior — misconfigured services never start.
