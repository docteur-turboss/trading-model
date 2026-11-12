# Quick Start — Your First Trading Platform Interaction

> **Goal:** Go from zero to market data flowing through the bus and viewing audit events in 10 minutes.

## Prerequisites

- Bun 1.4.4 (tested version, same as the Docker images in `services/*/Dockerfile`; see `bun --version`)
- Docker Desktop (for Compose)
- Git

```bash
# Clone and install
git clone <repo-url> trading-model
cd trading-model
bun install --frozen-lockfile
```

### Windows line endings

Source files must keep LF line endings (`.gitattributes` forces `eol=lf` on `*.ts`, `*.json`, `*.md`, `*.yml`…). A global `core.autocrlf true` (common in Git for Windows installs) checks them out as CRLF, and `bun run lint` then fails on formatting while CI passes.

```bash
# Set the repo to not convert line endings
git config core.autocrlf false

# Diagnose: must print nothing for files that have eol=lf
git ls-files --eol | grep "w/crlf" | grep "eol=lf"

# Repair a clean checkout (commit or stash your work first: this rewrites the working tree)
git status --short                     # must print nothing
git rm -q --cached -r . && git reset -q --hard
git ls-files --eol | grep "w/crlf" | grep "eol=lf"   # must print nothing
```

`text=auto` files without an `eol` attribute may stay CRLF on Windows: that is expected.

## Step 0: Create `.env`

```bash
cp .env.example .env
```

Edit `.env` and replace the example values of these variables with your own secrets (`openssl rand -hex 32`):

- `MYSQL_ROOT_PASSWORD` — MySQL root password
- `GRAFANA_PASSWORD` — Grafana admin password (required, no default)
- `MYSQL_EXPORTER_PASSWORD` — password of the read-only MySQL user of the metrics exporter (required, no default)
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

The gateway is the single entry point for all external requests. It only accepts mTLS clients with a SPIRE identity, so the host reaches it through the `edge-proxy` (plain HTTP on port 8449, `/v1` and `/v2` forwarded to the gateway):

```bash
docker compose up -d api-gateway edge-proxy

# Verify
curl -s http://localhost:8449/ping
# → {"status":"ok"}
```

## Step 3: See the Service Registry

Set your admin token: the secret of one of the `GATEWAY_AUTH_TOKENS` keys in your `.env` file (what follows the last `:` of `name:scopes:secret`):

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

Market data is not in the audit trail (MySQL keeps it, ADR-0027). The trail holds audit, training and DLQ events, for example `training.model.published` once a model is trained: add `&topic=training.model.published` to the query.

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
