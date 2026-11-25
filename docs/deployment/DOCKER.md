# Docker — Standards and Configuration

## Docker Compose Services

> **Development only.** This Compose stack has no scheduled backup and no
> backup metrics. Do not store real data in it. Real data belongs in the
> [Kubernetes deployment](KUBERNETES.md) ([BACKUP_DR.md](BACKUP_DR.md#known-limits)).

The platform runs the services listed in [services/README.md](../services/README.md) (no frontend, see [ADR-0018](../adr/0018-temporary-frontend-removal.md)) plus infrastructure containers (MongoDB, MySQL, Redis, SPIRE). The exact list is `docker compose config --services`.

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

Services on `backend-net` can reach each other by Docker service name (e.g. `message-manager`, `mysql`).

---

## Multi-stage Dockerfile

Every TypeScript service uses the same 3-stage pattern, for example [`services/message-manager/Dockerfile`](../../services/message-manager/Dockerfile). Base images are pinned by digest (Dependabot bumps them): read the digests in the Dockerfile.

| Stage     | Base image | Operations |
| --------- | ---------- | ---------- |
| `deps`    | `oven/bun:1.4.4`, pinned by digest | Copy manifests, `bun install --frozen-lockfile --production` (prod dependencies only) |
| `build`   | `oven/bun:1.4.4`, pinned by digest | Full `bun install --frozen-lockfile`, `bun run build` (shared packages) + `bun run build` (service) |
| `runtime` | `node:26.13.1-alpine`, pinned by digest | Add `tini` (init process), remove npm/npx, copy artifacts from previous stages, run as `appuser`; `HEALTHCHECK` runs `node -e` (no curl in the image): GET `/health/ready` over mTLS with the SVID; `CMD ["node", ...]` |

Bun builds, Node runs: Bun exposes neither the peer certificate on HTTPS request sockets nor `server.setSecureContext`, which caller identity and SVID rotation need ([ADR-0011](../adr/0011-spiffe-spire-workload-identity.md)).

The `--production` flag in the `deps` stage omits all `devDependencies`, so the runtime image only contains what is needed to serve traffic. `node_modules` comes entirely from the `deps` stage; the `build` stage only produces `dist/` artifacts.

---

## Edge proxy

The gateway only accepts SPIFFE mTLS clients, so nothing outside the mesh can call it directly. `edge-proxy` is the external entry point ([ADR-0018](../adr/0018-temporary-frontend-removal.md)): the official nginx image with `deploy/edge-proxy/default.conf` mounted, run as uid 101 on a read-only filesystem. It answers `/ping` and `/health/ready` itself and forwards `/v<major>/*` (`/v1`, `/v2`) to `https://api-gateway:3000` with its own SVID (`spiffe-helper-edge`, volume `svid-edge`), read on each handshake so the hourly rotation needs no reload.

```bash
curl -s http://localhost:8449/v1/trader-trainer/training-status -H "x-api-key: <secret of a GATEWAY_AUTH_TOKENS entry>"
```

---

## Images and registry

Every service image is built and published by the release workflow under `ghcr.io/trading-model/<service>`, tagged `X.Y.Z` and `latest` when it is the highest stable tag ([release.md](../contributing/release.md)).

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

Ports and their `*_PORT` variables are the `ports:` entries of [`docker-compose.yml`](../../docker-compose.yml) (`docker compose config`); the external entry point is `edge-proxy` ([Quick Start](../getting-started/quickstart.md)). Every published port is bound to `127.0.0.1`: only the Docker host reaches them, never the LAN. Loki has no authentication and the edge speaks plain HTTP.

---

## Dependencies and health checks

Containers wait for their dependencies to be **healthy** (`depends_on` with `condition: service_healthy`). Each service's chain is its `depends_on` in [`docker-compose.yml`](../../docker-compose.yml).

### Health checks

| Service              | Command                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `mongo`              | `echo 'db.runCommand("ping").ok' \| mongosh --quiet`                                               |
| `mysql`              | `mysqladmin ping -h localhost -u root`                                                              |
| All TS services      | `node -e <https GET with the SVID> https://localhost:3000/health/ready` (one line, see the service Dockerfiles) |
| `edge-proxy`         | `wget -q -O /dev/null http://127.0.0.1:8080/health/ready`                                          |

---

## Load balancing

Inbound load balancing is handled by the platform's own entry points (api-gateway, message-manager) rather than external nginx LBs. Each workload serves TLS directly with its SPIRE SVID (ADR-0011); no `proxy_ssl_verify off` passthrough is needed.

---

## Volumes and variables

Networks (`docker-api-net`, `data-net`, `backend-net`) and named volumes are the top-level `networks:` and `volumes:` of [`docker-compose.yml`](../../docker-compose.yml). Variables come from `.env` ([`.env.example`](../../.env.example)); those written `${X:?}` in the compose file are required. SVIDs reach services through the `svid-*` volumes, not host certificate mounts.
