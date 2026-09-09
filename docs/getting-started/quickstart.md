# Quick Start — Your First Trading Platform Interaction

> **Goal:** Go from zero to publishing a message and viewing audit events in 10 minutes.

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

## Step 1: Start Core Infrastructure

> mTLS is automatic: each service obtains its identity from SPIRE via `spiffe-helper`
> sidecars (ADR-0011), which write the SVID into `/run/spire/svid`. No certificate
> generation or `./certs` bundle is required.

```bash
# Start discovery-server + message-manager + databases
docker compose up -d redis mysql mongo
docker compose up -d discovery-server message-manager

# Verify they're healthy
curl -sk https://localhost:8443/ping
# → {"status":"ok"}
```

## Step 2: Start the API Gateway

The gateway is the single entry point for all external requests:

```bash
docker compose up -d api-gateway

# Verify
curl -sk https://localhost:8448/ping
# → {"status":"ok","service":"api-gateway"}
```

## Step 3: See the Service Registry

Set your admin token (from `.env` file — look for `AUTH_TOKENS` or `ADMIN_TOKEN`):

```bash
export ADMIN_TOKEN="change-me-in-production"  # Use your .env value
```

```bash
# List registered services (via gateway proxy)
curl -sk https://localhost:8448/v1/discovery/services \
  -H "x-api-key: $ADMIN_TOKEN"
```

You should see `discovery-server` and `message-manager` listed.

## Step 4: Publish a Message

```bash
# Publish a market data event
curl -sk https://localhost:8448/v1/broker/message \
  -H "x-api-key: $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "targetService": "audit-logger",
    "payload": {
      "symbol": "BTCUSDT",
      "price": 50000.0,
      "volume": 12.5
    },
    "deliveryMode": "at-most-once",
    "metadata": {
      "topic": "market.trade.recent.fetch",
      "eventType": "market.trade.recent.fetch",
      "schemaVersion": "1.0.0",
      "publisher": {
        "serviceName": "quickstart-demo",
        "instanceId": "demo-001"
      },
      "delivery": {
        "mode": "at-most-once",
        "ttl": 60000
      }
    }
  }'

# → 204 No Content
```

## Step 5: View Audit Events

Start the audit-logger:

```bash
docker compose up -d audit-logger
```

Then query the events:

```bash
curl -sk https://localhost:8448/v1/audit/events?limit=5 \
  -H "x-api-key: $ADMIN_TOKEN"
```

You should see your published message recorded as an audit event.

## Step 6: Start the Admin Dashboard

```bash
# Start the React SPA
bun run --filter admin-interface dev
```

Open `http://localhost:5173` in your browser. Navigate to **Services** to see the service registry, or **Audit Events** to see your published message.

## Next Steps

| If you want to...                | Follow this guide                               |
| -------------------------------- | ----------------------------------------------- |
| Understand the full architecture | `docs/standards/architecture-standards.md`                |
| Train a trading agent            | `services/trader-trainer/README.md`             |
| Debug a failed message           | `docs/operations/runbooks/runbook-message-bus-outage.md` |
| Set up monitoring                | `docs/deployment/DOCKER.md#monitoring`          |
| Deploy to Kubernetes             | `docs/deployment/KUBERNETES.md`                 |
| Run the full test suite          | `bun run test`                         |
