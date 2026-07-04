# Docker — Standards and Configuration

## Docker Compose Services

The platform runs **9 microservices** plus infrastructure containers (MongoDB, MySQL, Redis, nginx):

| Service               | Image / Build           | Container           | Host port                        | Network(s)              |
| --------------------- | ----------------------- | ------------------- | -------------------------------- | ----------------------- |
| `mongo`               | `mongo:7`               | `trading-mongo`     | —                                | `data-net` (internal)   |
| `mysql`               | `mysql:8`               | `trading-mysql`     | —                                | `data-net` (internal)   |
| `discovery-server`    | Build local             | `trading-discovery` | `${DISCOVERY_PORT:-8443}` → 3000 | `backend-net`            |
| `certificate-authority` | Build local           | `trading-ca`        | `${CA_PORT:-8447}` → 3000        | `backend-net`, `data-net` |
| `message-manager`     | Build local             | `trading-message`   | `${MESSAGE_PORT:-8444}` → 3000   | `backend-net`, `data-net` |
| `financial-scraper`   | Build local             | `trading-scraper`   | `${SCRAPER_PORT:-8445}` → 3000   | `backend-net`, `data-net` |
| `trader-trainer`      | Build local             | `trading-trainer`   | `${TRAINER_PORT:-8446}` → 3000   | `backend-net`            |
| `api-gateway`         | Build local             | `trading-gateway`   | `${GATEWAY_PORT:-8448}` → 3000   | `backend-net`            |
| `audit-logger`        | Build local             | `trading-audit`     | `${AUDIT_PORT:-8450}` → 3000     | `backend-net`, `data-net` |
| `admin-interface`     | Build local             | `trading-admin`     | `${ADMIN_PORT:-8449}` → 80       | `backend-net`            |
| `dlq-service`         | Build local             | `trading-dlq`       | `${DLQ_PORT:-8452}` → 3000       | `backend-net`, `data-net` |

### Networks

```yaml
networks:
  data-net:
    name: trading-data-network
    driver: bridge
    internal: true          # no external access — databases only
  backend-net:
    name: trading-backend-network
    driver: bridge
```

Services on `backend-net` can reach each other by Docker service name (e.g. `discovery-server`, `mysql`).

---

## Multi-stage Dockerfile

All **TypeScript services** use the same 3-stage pattern. Example with `discovery-server/Dockerfile`:

```dockerfile
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/package.json services/discovery-server/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/ services/discovery-server/
RUN npm ci
RUN npm run build:common
WORKDIR /app/services/discovery-server
RUN npx tsc

FROM node:26-alpine AS runtime
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
| `deps`    | `node:26-alpine` | Copy manifests, `npm ci --omit=dev` (prod dependencies only)                             |
| `build`   | `node:26-alpine` | Full `npm ci`, `tsc` to compile the service + shared package builds                      |
| `runtime` | `node:26-alpine` | Add `tini` (init process) and `curl` (healthchecks), copy artifacts from previous stages |

### Service-specific build variations

| Service                | Extra build steps                                                            |
| ---------------------- | ---------------------------------------------------------------------------- |
| `trader-trainer`       | `build:address-manager`, `build:broker-message` (in addition to common)      |
| `audit-logger`         | `build:address-manager`, `build:broker-message` (in addition to common)      |
| `certificate-authority`| `build:certificate-utils` (in addition to common)                            |
| `dlq-service`          | `build:certificate-utils` (in addition to common)                            |
| `admin-interface`      | **Different pattern** — Node build stage → `nginx:alpine` runtime stage      |

### Admin Interface (special case)

```dockerfile
FROM node:26-alpine AS build
WORKDIR /app
COPY services/admin-interface/package.json services/admin-interface/package-lock.json ./
RUN npm ci
COPY services/admin-interface/ .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY services/admin-interface/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

The admin-interface is a **React SPA** built with Vite, served by nginx on port 80 (no TLS — expected behind a gateway).

---

## Images and registry

Images are published to **GitHub Container Registry** (`ghcr.io`) with multiple tags:

```
ghcr.io/<owner>/trading-model/<service>:<semver>
ghcr.io/<owner>/trading-model/<service>:<major>.<minor>
ghcr.io/<owner>/trading-model/<service>:<major>
ghcr.io/<owner>/trading-model/<service>:<sha-commit>
```

All **9 microservices** are built and published by the release workflow:

| Service               | Image                                                        |
| --------------------- | ------------------------------------------------------------ |
| discovery-server      | `ghcr.io/trading-model/discovery-server`                     |
| message-manager       | `ghcr.io/trading-model/message-manager`                      |
| financial-scraper     | `ghcr.io/trading-model/financial-scraper`                    |
| trader-trainer        | `ghcr.io/trading-model/trader-trainer`                       |
| certificate-authority | `ghcr.io/trading-model/certificate-authority`                |
| api-gateway           | `ghcr.io/trading-model/api-gateway`                          |
| audit-logger          | `ghcr.io/trading-model/audit-logger`                         |
| admin-interface       | `ghcr.io/trading-model/admin-interface`                      |
| dlq-service           | `ghcr.io/trading-model/dlq-service`                          |

---

## TLS

TLS certificates are mounted from the host in read-only mode:

```yaml
volumes:
  - ${TLS_CERTS_DIR:-./certs}:/certs:ro
```

Variables expected inside the container:

| Variable        | Path in container       | Used by                              |
| --------------- | ----------------------- | ------------------------------------ |
| `TLS_KEY_PATH`  | `/certs/server-key.pem` | All services (except admin-interface) |
| `TLS_CERT_PATH` | `/certs/server.crt`     | All services (except admin-interface) |
| `TLS_CA_PATH`   | `/certs/ca.crt`         | All services (except admin-interface) |

> The admin-interface is served over plain HTTP (port 80) — TLS is terminated at the ingress/gateway.

---

## Port mapping

| Variable         | Default | Service               |
| ---------------- | ------- | --------------------- |
| `DISCOVERY_PORT` | `8443`  | discovery-server      |
| `MESSAGE_PORT`   | `8444`  | message-manager       |
| `SCRAPER_PORT`   | `8445`  | financial-scraper     |
| `TRAINER_PORT`   | `8446`  | trader-trainer        |
| `CA_PORT`        | `8447`  | certificate-authority |
| `GATEWAY_PORT`   | `8448`  | api-gateway           |
| `ADMIN_PORT`     | `8449`  | admin-interface       |
| `AUDIT_PORT`     | `8450`  | audit-logger          |
| `DLQ_PORT`       | `8452`  | dlq-service           |

---

## Dependencies and health checks

Containers wait for their dependencies to be **healthy** before starting:

```yaml
depends_on:
  mysql:
    condition: service_healthy
  discovery-server:
    condition: service_healthy
  mongo:
    condition: service_healthy
```

### Service dependency graph

```
mongo ─────┬── certificate-authority ─┐
           ├── message-manager ───────┤
           ├── audit-logger ──────────┤
           │                          ├── discovery-server ──┬── financial-scraper
mysql ─────┘                          │                     ├── trader-trainer
                                      │                     ├── api-gateway
                                      │                     ├── admin-interface
                                      │                     └── dlq-service
```

### Health checks

| Service              | Command                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `mongo`              | `echo 'db.runCommand("ping").ok' \| mongosh --quiet`                                               |
| `mysql`              | `mysqladmin ping -h localhost -u root`                                                              |
| All TS services      | `curl -sk --cert /certs/server.crt --key /certs/server-key.pem https://localhost:3000/ping \|\| exit 1` |
| `admin-interface`    | _(none — served by nginx, health determined by upstream dependency)_                               |

---

## nginx Load Balancers (production)

For production deployments with multiple instances per service, nginx configs are provided in `deploy/`:

| Config file                 | Upstream              | Targets             |
| --------------------------- | --------------------- | ------------------- |
| `deploy/nginx-discovery.conf` | `discovery_backend`   | `discovery-1:3000`, `discovery-2:3000` |
| `deploy/nginx-message.conf` | `message_backend`     | `message-1:3000`, `message-2:3000` |
| `deploy/nginx-gateway.conf` | `gateway_backend`     | `gateway-1:3000`, `gateway-2:3000` |
| `deploy/nginx-ca.conf`      | `ca_backend`          | `ca-1:3000`, `ca-2:3000` |

Each config provides round-robin TLS passthrough to two instances:

```nginx
upstream discovery_backend {
    server discovery-1:3000;
    server discovery-2:3000;
}

server {
    listen 3000;
    location / {
        proxy_pass https://discovery_backend;
        proxy_ssl_verify        off;
        proxy_ssl_session_reuse on;
        proxy_set_header Host             $host;
        proxy_set_header X-Real-IP        $remote_addr;
        proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Persistent volumes

```yaml
volumes:
  mongo-data:
  mysql-data:
  ca-keys:           # certificate-authority private keys (CA root key)
```

---

## Full docker-compose.yml architecture

The `docker-compose.yml` at the repository root defines all 9 microservices with:

- **Two isolated bridge networks** (`data-net` internal, `backend-net` routable)
- **Named volumes** for MongoDB data, MySQL data, and CA keys
- **Health-check-based startup ordering** via `depends_on: condition: service_healthy`
- **Environment variable injection** from `.env` file (all with defaults)
- **TLS certificate mounts** read-only for all services
