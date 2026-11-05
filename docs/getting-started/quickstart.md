# Quick Start — Your First Trading Platform Interaction

> **Goal:** Go from zero to market data flowing through the bus and viewing its audit events in 10 minutes.

## Prerequisites

- Bun 1.3+ (see `bun --version`)
- Docker Desktop (for Compose)
- Git

```bash
# Clone and install
git clone <repo-url> trading-model
cd trading-model
bun install --frozen-lockfile
```

## Step 0: Create `.env`

```bash
cp .env.example .env
```

Edit `.env` and replace the example values of these variables with your own secrets (`openssl rand -hex 32`):

- `MYSQL_ROOT_PASSWORD` — MySQL root password
- `GATEWAY_AUTH_TOKENS` — gateway API keys (`x-api-key`), comma-separated; you use one in Step 3
- `SIGNING_SECRET` — HMAC secret of the discovery instance tokens

The Compose stack runs with `NODE_ENV=production` by default: without these values the gateway and discovery-server refuse to start.

> **Development only.** The Docker Compose stack has no scheduled backup: do not store real data in it. See [SETUP.md](../deployment/SETUP.md#local-development-setup) for the full local setup.

## Step 1: Start Core Infrastructure

> mTLS is automatic: each service obtains its identity from SPIRE via `spiffe-helper`
> sidecars (ADR-0011), which write the SVID into `/run/spire/svid`. No certificate
> generation or `./certs` bundle is required.

```bash
# Start discovery-server + message-manager + databases
docker compose up -d redis mysql mongo
docker compose up -d discovery-server message-manager

# Verify they're healthy
# Services only accept mTLS clients with a SPIRE identity: check the
# container health (its healthcheck pings with the container's SVID)
docker inspect --format '{{.State.Health.Status}}' trading-discovery
# → healthy
```

## Step 2: Start the API Gateway

The gateway is the single entry point for all external requests. It only accepts mTLS clients with a SPIRE identity, so the host reaches it through the `edge-proxy` (plain HTTP on port 8449, `/v1` forwarded to the gateway):

```bash
docker compose up -d api-gateway edge-proxy

# Verify
curl -s http://localhost:8449/ping
# → {"status":"ok"}
```

## Step 3: See the Service Registry

Set your admin token (one of the `GATEWAY_AUTH_TOKENS` values in your `.env` file):

```bash
export ADMIN_TOKEN="change-me-to-a-long-random-key"  # Use your .env value
```

```bash
# List registered services (via gateway proxy)
curl -s http://localhost:8449/v1/discovery-server/services \
  -H "x-api-key: $ADMIN_TOKEN"
```

You should see `discovery-server` and `message-manager` listed.

## Step 4: Let the Scraper Publish Market Data

Messages are published by the services themselves: the gateway only exposes the
public API (`docs/services/openapi/api-gateway.yaml`), not service-to-service
routes such as message-manager `POST /message`. Start the scraper, which
publishes the market data it collects every `SCRAPE_INTERVAL` (one minute by
default):

```bash
docker compose up -d financial-scraper
```

## Step 5: View Audit Events

Start the audit-logger:

```bash
docker compose up -d audit-logger
```

Then query the events:

```bash
curl -s http://localhost:8449/v1/audit-logger/events?limit=5 \
  -H "x-api-key: $ADMIN_TOKEN"
```

You should see the scraper's market data events recorded in the audit trail.

> There is no admin dashboard for now ([ADR-0018](../adr/0018-temporary-frontend-removal.md)): the gateway API above is how you inspect the registry, audit events and the DLQ.

## Next Steps

| If you want to...                | Follow this guide                               |
| -------------------------------- | ----------------------------------------------- |
| Understand the full architecture | `docs/standards/architecture-standards.md`                |
| Train a trading agent            | `services/trader-trainer/README.md`             |
| Debug a failed message           | `docs/operations/runbooks/runbook-message-bus-outage.md` |
| Set up monitoring                | `docs/deployment/DOCKER.md#monitoring`          |
| Deploy to Kubernetes             | `docs/deployment/KUBERNETES.md`                 |
| Run the full test suite          | `bun run test`                         |
