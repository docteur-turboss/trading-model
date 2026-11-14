# Docker — Standards and Configuration

## Docker Compose Services

> **Development only.** This Compose stack has no scheduled backup and no
> backup metrics. Do not store real data in it. Real data belongs in the
> [Kubernetes deployment](KUBERNETES.md) ([BACKUP_DR.md](BACKUP_DR.md#known-limits)).

The platform runs **7 microservices** (no frontend, see [ADR-0018](../adr/0018-temporary-frontend-removal.md)) plus infrastructure containers (MongoDB, MySQL, Redis, SPIRE):

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
| `dlq-service`         | Build local             | `trading-dlq`       | `${DLQ_PORT:-8452}` → 3000       | `backend-net`, `data-net` |
| `edge-proxy`          | `nginx` (digest-pinned) | `trading-edge`      | `${EDGE_PORT:-8449}` → 8080      | `backend-net`            |

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

All 7 TypeScript services use the same 3-stage pattern, for example [`services/discovery-server/Dockerfile`](../../services/discovery-server/Dockerfile). Base images are pinned by digest (Dependabot bumps them): read the digests in the Dockerfile.

| Stage     | Base image | Operations |
| --------- | ---------- | ---------- |
| `deps`    | `oven/bun:1.4.4`, pinned by digest | Copy manifests, `bun install --frozen-lockfile --production` (prod dependencies only) |
| `build`   | `oven/bun:1.4.4`, pinned by digest | Full `bun install --frozen-lockfile`, `bun run build` (shared packages) + `bun run build` (service) |
| `runtime` | `node:26.13.0-alpine`, pinned by digest | Add `tini` (init process) and `curl` (healthcheck), remove npm/npx, copy artifacts from previous stages, run as `appuser`; `HEALTHCHECK` calls `/health/ready` over mTLS with the SVID; `CMD ["node", ...]` |

Bun builds, Node runs: Bun exposes neither the peer certificate on HTTPS request sockets nor `server.setSecureContext`, which caller identity and SVID rotation need ([ADR-0011](../adr/0011-spiffe-spire-workload-identity.md)).

The `--production` flag in the `deps` stage omits all `devDependencies`, so the runtime image only contains what is needed to serve traffic. `node_modules` comes entirely from the `deps` stage; the `build` stage only produces `dist/` artifacts.

---

## Edge proxy

The gateway only accepts SPIFFE mTLS clients, so nothing outside the mesh can call it directly. `edge-proxy` is the external entry point ([ADR-0018](../adr/0018-temporary-frontend-removal.md)): the official nginx image with `deploy/edge-proxy/default.conf` mounted, run as uid 101 on a read-only filesystem. It answers `/ping` and `/health/ready` itself and forwards `/v<major>/*` (`/v1`, `/v2`) to `https://api-gateway:3000` with its own SVID (`spiffe-helper-edge`, volume `svid-edge`), read on each handshake so the hourly rotation needs no reload.

```bash
curl -s http://localhost:8449/v1/discovery-server/services -H "x-api-key: <AUTH_TOKENS value>"
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

All **7 microservices** are built and published by the release workflow:

| Service               | Image                                                        |
| --------------------- | ------------------------------------------------------------ |
| discovery-server      | `ghcr.io/trading-model/discovery-server`                     |
| message-manager       | `ghcr.io/trading-model/message-manager`                      |
| financial-scraper     | `ghcr.io/trading-model/financial-scraper`                    |
| trader-trainer        | `ghcr.io/trading-model/trader-trainer`                       |
| api-gateway           | `ghcr.io/trading-model/api-gateway`                          |
| audit-logger          | `ghcr.io/trading-model/audit-logger`                         |
| dlq-service           | `ghcr.io/trading-model/dlq-service`                          |

---

## TLS

mTLS is mandatory and automatic via SPIRE (ADR-0011): `spiffe-helper` sidecars
write each service SVID into `/run/spire/svid`. No host certificates are mounted.

Variables expected inside the container:

| Variable        | Path in container                  | Used by                              |
| --------------- | ---------------------------------- | ------------------------------------ |
| `TLS_KEY_PATH`  | `/run/spire/svid/svid_key.pem`     | All services                          |
| `TLS_CERT_PATH` | `/run/spire/svid/svid.pem`         | All services                          |
| `TLS_CA_PATH`   | `/run/spire/svid/bundle.pem`       | All services                          |

---

## Port mapping

| Variable         | Default | Service               |
| ---------------- | ------- | --------------------- |
| `DISCOVERY_PORT` | `8443`  | discovery-server      |
| `MESSAGE_PORT`   | `8444`  | message-manager       |
| `SCRAPER_PORT`   | `8445`  | financial-scraper     |
| `TRAINER_PORT`   | `8446`  | trader-trainer        |
| `GATEWAY_PORT`   | `8448`  | api-gateway           |
| `AUDIT_PORT`     | `8450`  | audit-logger          |
| `DLQ_PORT`       | `8452`  | dlq-service           |
| `EDGE_PORT`      | `8449`  | edge-proxy (HTTP)     |

Every published port (these seven, plus Prometheus 9090, Alertmanager 9093, Grafana 3001, Loki 3100 and Jaeger 16686) is bound to `127.0.0.1`: only the Docker host reaches them, never the LAN. Loki has no authentication and the edge speaks plain HTTP.

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
                                      │                     ├── dlq-service
                                      │                     └── edge-proxy (after api-gateway)
```

### Health checks

| Service              | Command                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `mongo`              | `echo 'db.runCommand("ping").ok' \| mongosh --quiet`                                               |
| `mysql`              | `mysqladmin ping -h localhost -u root`                                                              |
| All TS services      | `curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/ping \|\| exit 1` |
| `edge-proxy`         | `wget -q -O /dev/null http://127.0.0.1:8080/health/ready`                                          |

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
