# Local service development

How to change one service and see it run. Supported method: **rebuild that service's container in the Compose stack**. Running a service outside a container (`bun run dev`) is **not supported**, for any of the 7 services (`discovery-server`, `message-manager`, `financial-scraper`, `trader-trainer`, `api-gateway`, `audit-logger`, `dlq-service`): they all share the same `dev` script and the same TLS requirement.

## Why `bun run dev` does not work alone

Checked by running `bun run dev` in `services/message-manager` without Compose:

1. Env validation fails first: `TLS_KEY_PATH`, `TLS_CERT_PATH`, `TLS_CA_PATH`, `APP_NAME`, `SERVICE_NAME`, `INSTANCE_ID` and `ADDRESS_MANAGER_URL` are `Invalid input: expected string, received undefined`. These variables are set by `docker-compose.yml`, not by any file read by `bun run dev`.
2. With them set to the Compose values (`/run/spire/svid/svid_key.pem`, `svid.pem`, `bundle.pem`), startup stops with `Failed to read TLS CA certificate from "/run/spire/svid/bundle.pem": ENOENT` (`packages/http/src/infrastructure/http-tls-loader.ts`).

The `/run/spire/svid/*` paths are the values `docker-compose.yml` sets (and [ENV.md](../deployment/ENV.md) documents); only the `spiffe-helper-<x>` sidecar writes files there, with a SPIRE SVID (ADR-0011). Services also only accept mTLS peers with a SPIRE identity and find each other through discovery-server (itself behind mTLS). Nothing in the repository issues local SVIDs.

`ENFORCE_MTLS_STRICT=false` is not a workaround: it only relaxes the caller ACL, the SVID is still required.

## The loop: edit, rebuild, read logs

Prerequisites: Docker, `.env` from `.env.example` (see [Quick Start](quickstart.md#step-0-create-env)). On Git Bash for Windows, prefix with `MSYS_NO_PATHCONV=1` if a path argument is rewritten.

```bash
# 1. First time: start the service. Compose starts its depends_on chain
#    (SPIRE, spiffe-helper-<x>, redis, discovery-server, ...) by itself.
docker compose -p tm up -d --build <service>

# 2. Edit code, then rebuild and restart only that service
docker compose -p tm up -d --build --no-deps <service>

# 3. Follow its logs
docker compose -p tm logs -f --tail 100 <service>

# 4. Check health
docker compose -p tm ps <service>
```

The SVID volume survives a rebuild, so the service keeps its identity. If the image is unchanged, Compose leaves the container running.

Dependencies started by step 1 besides SPIRE (`spire-server`, `spire-bootstrap`, `spire-agent`) and the service's own `spiffe-helper-<x>` sidecar (from `depends_on` in `docker-compose.yml`; checked with `docker compose up --dry-run`):

| Service | Also started |
| --- | --- |
| `discovery-server` | `redis` |
| `api-gateway` | `redis`, `discovery-server` |
| `message-manager` | `redis`, `discovery-server` |
| `trader-trainer` | `redis`, `discovery-server`, `message-manager` |
| `financial-scraper` | `redis`, `mysql`, `migrate` (one-shot), `discovery-server`, `message-manager` |
| `audit-logger` | `redis`, `mongo`, `discovery-server` |
| `dlq-service` | `redis`, `mongo`, `discovery-server` |

Use `--no-deps` only after step 1 has run once; with it Compose does not start missing dependencies.

## Debugging

- Raise verbosity: set `LOG_LEVEL=debug` in `.env`, then `docker compose -p tm up -d --no-deps <service>`. At the default `info` level a healthy `api-gateway` prints nothing.
- Shell in: `docker compose -p tm exec <service> sh`.
- `curl` from the host fails (no SVID). Call a service from inside its container with its own SVID (this is the Compose healthcheck):

  ```bash
  docker compose -p tm exec <service> curl -skf \
    --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
    https://localhost:3000/health/ready
  ```

  Verified on `api-gateway`: `{"status":"ok","checks":{"discovery":"ok"}}`. Gateway routes from outside go through `edge-proxy` on port 8449 (see [Quick Start](quickstart.md)).
- Unit tests need no stack: `bun run --filter <package-name> test` (`trader-trainer` has package name `trader-service`).

## One Compose stack at a time

`docker-compose.yml` sets fixed `container_name: trading-*`. Two stacks, even with different `-p` names, cannot coexist: the second `up` fails with `Conflict. The container name "/trading-redis" is already in use`. If you started the [Quick Start](quickstart.md) stack (no `-p`), run `docker compose down` on it first, or use that stack for this loop and drop `-p tm` from the commands (the project name must be the same on every command).

## Cleanup

Docker Desktop's disk fills quickly. When done:

```bash
docker compose -p tm down -v --rmi local
```

## `DNS_NAME_MAP`

Only for deployments where service hostnames do not resolve through Docker or Kubernetes DNS: a JSON object mapping a name to an address, see [ENV.md](../deployment/ENV.md). The Compose stack does not need it.
