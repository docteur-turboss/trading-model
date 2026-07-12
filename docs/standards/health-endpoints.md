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

## Service-Specific Endpoints

All services expose **`GET /ping`** returning `{"status":"ok"}`.

Services with additional health endpoints:

| Service               | Endpoint       | Returns                                          |
| --------------------- | -------------- | ------------------------------------------------ |
| Certificate Authority | `GET /health`  | `{"status":"ok","caInitialized":true,...}`        |
| Audit Logger          | `GET /health`  | `{"status":"ok","queueDepth":N,...}`              |
| discovery-server      | `GET /ping`    | `{"status":"ok"}` (no /health)                    |

## Implementation

Services use `createSecureServer` from `@trading-model/common` which automatically mounts `GET /ping`.

For custom health endpoints, mount additional routes:

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    // service-specific fields
  });
});
```

## Kubernetes Probe Configuration

```yaml
startupProbe:
  httpGet:
    path: /ping
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 30

livenessProbe:
  httpGet:
    path: /ping
    port: 3000
  periodSeconds: 15
  timeoutSeconds: 5

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  periodSeconds: 10
  timeoutSeconds: 3
```

## Related

- [Architecture Standards](architecture-standards.md) — Service conventions
- [Operations](../operations/README.md) — Operational procedures
- [Kubernetes Deployment](../deployment/KUBERNETES.md) — K8s probe configuration
