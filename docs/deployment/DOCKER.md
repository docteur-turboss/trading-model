# Docker — Standards and Configuration

## Docker Compose Services

The platform runs **8 microservices** plus infrastructure containers (MongoDB, MySQL, Redis, SPIRE):

| Service               | Image / Build           | Container           | Host port                        | Network(s)              |
| --------------------- | ----------------------- | ------------------- | -------------------------------- | ----------------------- |
| `mongo`               | `mongo:7`               | `trading-mongo`     | —                                | `data-net` (internal)   |
| `mysql`               | `mysql:8`               | `trading-mysql`     | —                                | `data-net` (internal)   |
| `discovery-server`    | Build local             | `trading-discovery` | `${DISCOVERY_PORT:-8443}` → 3000 | `backend-net`            |
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
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/discovery-server
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/discovery-server/package.json ./services/discovery-server/
COPY --from=build /app/services/discovery-server/dist ./services/discovery-server/dist
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/discovery-server/dist/application/index.js"]
```

**Stages:**

| Stage     | Base image        | Operations                                                                               |
| --------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `deps`    | `oven/bun:1-alpine` | Copy manifests, `bun install --frozen-lockfile --production` (prod dependencies only)   |
| `build`   | `oven/bun:1-alpine` | Full `bun install --frozen-lockfile`, `bun run build` (all shared packages) + `bun run build` (service) |
| `runtime` | `oven/bun:1-alpine` | Add `tini` (init process) and `curl` (healthchecks), copy artifacts from previous stages |

The `--production` flag in the `deps` stage omits all `devDependencies`, so the runtime image only contains what is needed to serve traffic. `node_modules` comes entirely from the `deps` stage; the `build` stage only produces `dist/` artifacts.

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

All **8 microservices** are built and published by the release workflow:

| Service               | Image                                                        |
| --------------------- | ------------------------------------------------------------ |
| discovery-server      | `ghcr.io/trading-model/discovery-server`                     |
| message-manager       | `ghcr.io/trading-model/message-manager`                      |
| financial-scraper     | `ghcr.io/trading-model/financial-scraper`                    |
| trader-trainer        | `ghcr.io/trading-model/trader-trainer`                       |
| api-gateway           | `ghcr.io/trading-model/api-gateway`                          |
| audit-logger          | `ghcr.io/trading-model/audit-logger`                         |
| admin-interface       | `ghcr.io/trading-model/admin-interface`                      |
| dlq-service           | `ghcr.io/trading-model/dlq-service`                          |

---

## TLS

mTLS is mandatory and automatic via SPIRE (ADR-0011): `spiffe-helper` sidecars
write each service SVID into `/run/spire/svid`. No host certificates are mounted.

Variables expected inside the container:

| Variable        | Path in container                  | Used by                              |
| --------------- | ---------------------------------- | ------------------------------------ |
| `TLS_KEY_PATH`  | `/run/spire/svid/svid_key.pem`     | All services (except admin-interface) |
| `TLS_CERT_PATH` | `/run/spire/svid/svid.pem`         | All services (except admin-interface) |
| `TLS_CA_PATH`   | `/run/spire/svid/bundle.pem`       | All services (except admin-interface) |

> The admin-interface is served over plain HTTP (port 80) — TLS is terminated at the ingress/gateway.

---

## Port mapping

| Variable         | Default | Service               |
| ---------------- | ------- | --------------------- |
| `DISCOVERY_PORT` | `8443`  | discovery-server      |
| `MESSAGE_PORT`   | `8444`  | message-manager       |
| `SCRAPER_PORT`   | `8445`  | financial-scraper     |
| `TRAINER_PORT`   | `8446`  | trader-trainer        |
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
mongo ─────┬── message-manager ───────┤
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
| All TS services      | `curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/ping \|\| exit 1` |
| `admin-interface`    | _(none — served by nginx, health determined by upstream dependency)_                               |

---

## Load balancing

Inbound load balancing is handled by the platform's own entry points (api-gateway, discovery-server, message-manager) rather than external nginx LBs. Each workload serves TLS directly with its SPIRE SVID (ADR-0011); no `proxy_ssl_verify off` passthrough is needed.

---

## Persistent volumes

```yaml
volumes:
  mongo-data:
  mysql-data:
  spire-data:       # SPIRE server datastore (ADR-0011)
  spire-agent-sockets:
```

---

## Full docker-compose.yml architecture

The `docker-compose.yml` at the repository root defines the microservices with:

- **Two isolated bridge networks** (`data-net` internal, `backend-net` routable)
- **Named volumes** for MongoDB data, MySQL data, and SPIRE datastore/sockets
- **Health-check-based startup ordering** via `depends_on: condition: service_healthy`
- **Environment variable injection** from `.env` file (all with defaults)
- **TLS certificate mounts** read-only for all services
