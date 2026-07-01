# Health Endpoint Standard

All trading-model services expose health check endpoints for Kubernetes probes.

## Standard Endpoints

| Endpoint        | Purpose                           | Probe Type                  | Expected Response                                   |
| --------------- | --------------------------------- | --------------------------- | --------------------------------------------------- |
| `/ping`         | Basic liveness                    | startupProbe, livenessProbe | `{"status":"ok"}` (HTTP 200)                        |
| `/health/ready` | Readiness (depends on downstream) | readinessProbe              | `{"status":"ok"}` (HTTP 200) or 503 if not ready    |
| `/health`       | Full health status                | Admin/debug                 | `{"status":"ok","uptime":N,...}` (service-specific) |
| `/metrics`      | Prometheus metrics                | Prometheus scrape           | OpenMetrics text format                             |

## Probe Configuration

### Liveness (`/ping`)

- Lightweight, no dependency checks
- Must return HTTP 200 if the process is alive
- Used by: `livenessProbe`, `startupProbe`

### Readiness (`/health/ready`)

- Checks dependencies (DB, discovery server, Redis)
- Returns 200 when ready to serve traffic, 503 otherwise
- Used by: `readinessProbe`

### Startup (`/ping`)

- Uses same endpoint as liveness but with generous timeout
- `initialDelaySeconds: 30`, `periodSeconds: 5`, `failureThreshold: 12` (90s window)
- Prevents K8s from killing slow-starting services

## Current Compliance

| Service               | `/ping`       | `/health/ready` | `/health` | `/metrics` |
| --------------------- | ------------- | --------------- | --------- | ---------- |
| discovery-server      | ✅            | ✅              | ❌        | ✅         |
| message-manager       | ✅            | ✅              | ❌        | ✅         |
| certificate-authority | ✅            | ✅              | ✅        | ✅         |
| financial-scraper     | ✅            | ✅              | ❌        | ✅         |
| trader-trainer        | ✅            | ✅              | ❌        | ✅         |
| api-gateway           | ✅            | ✅              | ❌        | ✅         |
| audit-logger          | ✅            | ✅              | ✅        | ✅         |
| dlq-service           | ✅            | ✅              | ✅        | ✅         |
| admin-interface       | nginx `/ping` | nginx `/ping`   | ❌        | ❌         |

## Migration Target

All services should expose:

```
GET /ping          → 200 {"status":"ok"}
GET /health/ready  → 200 {"status":"ok"} or 503
GET /health        → 200 {"status":"ok","uptime":N,"dependencies":{...}}
GET /metrics       → OpenMetrics
```

For Node.js services, add a `/health` route using `createSecureServer` from `@trading-model/common`. See `services/certificate-authority/src/app/health.routes.ts` for a reference implementation.
