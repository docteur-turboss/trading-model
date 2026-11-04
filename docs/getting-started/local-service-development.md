# Local service development

How to change one service and see it run. Supported method: **rebuild that service's container in the Compose stack**. Running a service outside a container (`bun run dev`) is **not supported**.

## Why `bun run dev` does not work alone

Every service requires `TLS_KEY_PATH`, `TLS_CERT_PATH` and `TLS_CA_PATH` ([ENV.md](../deployment/ENV.md)). They default to `/run/spire/svid/*`, a volume that only the `spiffe-helper-<x>` sidecar fills with a SPIRE SVID (ADR-0011). Services only accept mTLS peers with a SPIRE identity, and they find each other through discovery-server (itself behind mTLS). Outside Compose there is no SVID, so the service fails at startup, and nothing in the repository issues local SVIDs.

`ENFORCE_MTLS_STRICT=false` is not a workaround: it only relaxes the caller ACL, the SVID is still required.

## The loop: edit, rebuild, read logs

Prerequisites: Docker, `.env` from `.env.example` (see [Quick Start](quickstart.md#step-0-create-env)).

```bash
# 1. Start the dependencies once (named project keeps cleanup safe)
docker compose -p tm up -d redis mysql mongo
docker compose -p tm up -d discovery-server message-manager

# 2. Edit code, then rebuild and restart only that service
docker compose -p tm up -d --build message-manager

# 3. Follow its logs
docker compose -p tm logs -f --tail 100 message-manager

# 4. Check health (the healthcheck uses the container's own SVID)
docker compose -p tm ps message-manager
```

Compose service names: `discovery-server`, `message-manager`, `financial-scraper`, `trader-trainer`, `api-gateway`, `audit-logger`, `dlq-service`. The SPIRE services and `spiffe-helper-*` sidecars start automatically as dependencies; the SVID volume survives a rebuild, so the service keeps its identity.

Debugging:

- Raise verbosity: set `LOG_LEVEL=debug` in `.env`, then `docker compose -p tm up -d <service>`.
- Shell in: `docker compose -p tm exec <service> sh`.
- `curl` from the host fails (no SVID). Call a service from inside the stack with the container's SVID, or go through `edge-proxy` on port 8449 for gateway routes (see [Quick Start](quickstart.md)).
- Unit tests need no stack: `bun run --filter <package-name> test` (`trader-trainer` has package name `trader-service`).

## Cleanup

Docker Desktop's disk fills quickly. When done:

```bash
docker compose -p tm down -v --rmi local
```

## `DNS_NAME_MAP`

Only for deployments where service hostnames do not resolve through Docker or Kubernetes DNS: a JSON object mapping a name to an address, see [ENV.md](../deployment/ENV.md). The Compose stack does not need it.
