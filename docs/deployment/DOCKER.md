# Docker — Standards and Configuration

## Docker Compose Services

| Service             | Image / Build | Container           | Host port                        |
| ------------------- | ------------- | ------------------- | -------------------------------- |
| `mongo`             | `mongo:7`     | `trading-mongo`     | —                                |
| `mysql`             | `mysql:8`     | `trading-mysql`     | —                                |
| `discovery-server`  | Build local   | `trading-discovery` | `${DISCOVERY_PORT:-8443}` → 3000 |
| `message-manager`   | Build local   | `trading-message`   | `${MESSAGE_PORT:-8444}` → 3000   |
| `financial-scraper` | Build local   | `trading-scraper`   | `${SCRAPER_PORT:-8445}` → 3000   |
| `trader-trainer`    | Build local   | `trading-trainer`   | `${TRAINER_PORT:-8446}` → 3000   |

---

## Multi-stage Dockerfile

All services use the same 3-stage pattern. Example with `discovery-server/Dockerfile`:

```dockerfile
# =============================================================================
#  discovery-server -- Service Discovery
#  docker build -t trading-model/discovery-server -f services/discovery-server/Dockerfile .
# =============================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/package.json services/discovery-server/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/ services/discovery-server/
RUN npm ci
RUN npm run build:common
WORKDIR /app/services/discovery-server
RUN npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl

COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/discovery-server/package.json ./services/discovery-server/

COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist

COPY --from=build /app/services/discovery-server/dist ./services/discovery-server/dist

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/discovery-server/dist/app/index.js"]
```

**Stages:**

| Stage     | Base image       | Operations                                                                               |
| --------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `deps`    | `node:20-alpine` | Copy manifests, `npm ci --omit=dev` (prod dependencies only)                             |
| `build`   | `node:20-alpine` | Full `npm ci`, `tsc` to compile the service                                              |
| `runtime` | `node:20-alpine` | Add `tini` (init process) and `curl` (healthchecks), copy artifacts from previous stages |

The `trader-trainer` also compiles `address-manager` and `broker-message`:

```dockerfile
RUN npm run build:common
RUN npm run build:address-manager
RUN npm run build:broker-message
```

---

## Images and registry

Images are published to **GitHub Container Registry** (`ghcr.io`) with multiple tags:

```
ghcr.io/<owner>/trading-model/<service>:<semver>
ghcr.io/<owner>/trading-model/<service>:<major>.<minor>
ghcr.io/<owner>/trading-model/<service>:<major>
ghcr.io/<owner>/trading-model/<service>:<sha-commit>
```

---

## TLS

TLS certificates are mounted from the host in read-only mode:

```yaml
volumes:
  - ${TLS_CERTS_DIR:-./certs}:/certs:ro
```

Variables expected inside the container:

| Variable        | Path in container       |
| --------------- | ----------------------- |
| `TLS_KEY_PATH`  | `/certs/server-key.pem` |
| `TLS_CERT_PATH` | `/certs/server.crt`     |
| `TLS_CA_PATH`   | `/certs/ca.crt`         |

---

## Port mapping

| Variable         | Default | Service           |
| ---------------- | ------- | ----------------- |
| `DISCOVERY_PORT` | `8443`  | discovery-server  |
| `MESSAGE_PORT`   | `8444`  | message-manager   |
| `SCRAPER_PORT`   | `8445`  | financial-scraper |
| `TRAINER_PORT`   | `8446`  | trader-trainer    |

---

## Network

All services share an internal `trading-net` network (`driver: bridge`):

```yaml
networks:
  trading-net:
    name: trading-network
    driver: bridge
```

Services discover each other by their Docker service name (e.g. `discovery-server`, `mysql`, `mongo`).

---

## Dependencies and health checks

Containers wait for their dependencies to be **healthy** before starting:

```yaml
depends_on:
  mysql:
    condition: service_healthy
  discovery-server:
    condition: service_healthy
```

**Health checks:**

| Service            | Command                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `mongo`            | `echo 'db.runCommand("ping").ok' \| mongosh --quiet`                                        |
| `mysql`            | `mysqladmin ping -h localhost -u root -p${MYSQL_ROOT_PASSWORD}`                             |
| `discovery-server` | `curl -sk --cert /certs/server.crt --key /certs/server-key.pem https://localhost:3000/ping` |

---

## Full docker-compose.yml excerpt

```yaml
services:
  mongo:
    image: mongo:7
    container_name: trading-mongo
    volumes:
      - mongo-data:/data/db
    networks:
      - trading-net
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  mysql:
    image: mysql:8
    container_name: trading-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-changeme}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-financial_scraper}
    volumes:
      - mysql-data:/var/lib/mysql
    networks:
      - trading-net
    healthcheck:
      test: mysqladmin ping -h localhost -u root -p${MYSQL_ROOT_PASSWORD:-changeme}

  discovery-server:
    build:
      context: .
      dockerfile: services/discovery-server/Dockerfile
    ports:
      - '${DISCOVERY_PORT:-8443}:3000'
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: '3000'
      TLS_KEY_PATH: /certs/server-key.pem
      TLS_CERT_PATH: /certs/server.crt
      TLS_CA_PATH: /certs/ca.crt
      LOG_LEVEL: ${LOG_LEVEL:-info}
      CLEANUP_SERVICE_INTERVAL_MS: '600000'
    volumes:
      - ${TLS_CERTS_DIR:-./certs}:/certs:ro
    networks:
      - trading-net
    healthcheck:
      test: curl -sk --cert /certs/server.crt --key /certs/server-key.pem https://localhost:3000/ping || exit 1
```

Persistent volumes:

```yaml
volumes:
  mongo-data:
  mysql-data:
```
