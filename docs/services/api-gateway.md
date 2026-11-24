# api-gateway — API Gateway

Single external entry point for the system. Routes, authenticates, rate-limits, and proxies all incoming requests to internal services.

## General Information

| Property         | Value                                     |
| ---------------- | ----------------------------------------- |
| Service name     | `api-gateway`                             |
| Port (host)      | `8448`                                    |
| Port (container) | `3000`                                    |
| Dependencies     | `@trading-model/common` |

## REST Endpoints

### Health Check

**`GET /ping`**

Lightweight health check.

**Response:** `200 OK`

```json
{
  "status": "ok",
  "service": "api-gateway"
}
```

### Proxy Routes

**`/v{version}/{serviceName}/{path}`**

Proxies the public routes listed in `PUBLIC_ROUTES` (`services/api-gateway/src/shared/public-routes.ts`, published as `docs/services/openapi/api-gateway.yaml`) to the target internal service, reached at its DNS name (ADR-0072). `PUBLIC_ROUTES` lists each route per major (`/v2/financial-scraper/candles/symbols/:symbol`): a major a service does not serve answers `404`. Any other route answers `404` before resolution: the gateway calls services with its own SVID, so proxying service-to-service routes (discovery `/register` or `/heartbeat`...) would lend its identity to every API client. A path that URL normalization would change (`..`, `%2e`, `\`) is refused too.

**Headers:**

| Header          | Required | Description                |
| --------------- | -------- | -------------------------- |
| `x-api-key`     | Yes\*    | API key for authentication |
| `authorization` | No       | Fallback auth header       |

\*All routes except `/ping` require authentication via `x-api-key: <token>` or `Authorization: Bearer <token>` (the `Bearer ` prefix is case-insensitive and also stripped from the configured header). Validated against `AUTH_TOKENS` by SHA-256 digests compared with `timingSafeEqual`; the rate-limit identity is `client:` + 32 hex chars of that digest (one quota per token, no token material in logs).

**Scopes (ADR-0059).** Each key of `AUTH_TOKENS` is `name:scope1+scope2:secret`. `read` opens the `GET` routes, `risk:admin` the risk-execution kill switch (engage, re-arm). The `dlq:write` scope went with the public `/v1/dlq-service/*` routes (ADR-0073, issue #1241); dead letters are handled by the operator CLI inside the stack. For one release a key that still declares `dlq:write` starts the gateway, the scope is ignored and a warning is logged at startup; issue #2620 refuses it again. A key without the scope a route needs gets `403`. The gateway drops any client `x-actor` header and sends `x-actor: <key name>` (never the secret) to the service. A bare secret (old format) is refused at startup.

**Response (success):** Proxied response from target service (status code and body forwarded as-is).

**Response (errors):**

| Status | Condition            | Body                                                        |
| ------ | -------------------- | ----------------------------------------------------------- |
| `400`  | Invalid route        | `{ "error": "Invalid route format" }`                       |
| `401`  | Missing/invalid auth | `{ "error": "Unauthorized" }`                               |
| `403`  | Key lacks the scope  | `{ "error": "Forbidden", "reason": "API key lacks the <scope> scope" }` |
| `429`  | Rate limited         | `{ "error": "Too many requests", "retryAfter": <seconds> }` |
| `404`  | Not a public route   | `{ "error": "Route not found" }`                            |
| `503`  | Service unavailable  | `{ "error": "Service unavailable" }` (name does not resolve or call failed; cause in the log only) |

## Rate Limiting

- **Algorithm:** `express-rate-limit` (sliding window)
- **Default:** 100 requests per 60s window (configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`)
- **Response:** `429 Too Many Requests` with `retryAfter` in seconds
- **Key:** the authenticated API client (`clientIdentity` from the token), falling back to the remote address. External requests all arrive from the `edge-proxy`, so a per-address limit would put every client in one bucket
- **Per pod:** the store is in memory (no Redis in the gateway), so each pod counts on its own. With the HPA (`minReplicas: 2`, `maxReplicas: 8`, `deploy/k8s/config/api-gateway-autoscaling.yaml`) the effective limit per client is `RATE_LIMIT_MAX` x pods: 200 to 800 requests per 60 s window by default (100 x 2 to 100 x 8), assuming requests spread evenly over the pods.
- **Three layers:** (1) Ingress `limit-rps: 100` (`deploy/k8s/ingress/gateway-ingress.yaml`); (2) edge-proxy `limit_req` per client address, per edge-proxy replica (`deploy/edge-proxy/default.conf`); (3) this limiter, per gateway pod. The gateway limit is a last guard per API client, not an exact quota.
- **Accepted trade-off:** same choice as the other in-process limiters ([ADR-0047](../adr/0047-redis-isolation-per-service.md)). A shared store (Redis) would be justified only if an exact per-client quota becomes a requirement (billing, contractual limit); it needs its own architecture decision.

## Caching

- In-memory GET response cache (status 200 only)
- Upstream answers capped at `PROXY_MAX_RESPONSE_BYTES`: larger ones are cut and answered 502 (ADR-0054)
- Default TTL: 30s (configurable via `CACHE_TTL_MS`)
- Metric `gateway_response_cache_lookups_total{result="hit"|"miss"}`: one count per cache read of a GET (an expired entry is a miss)

## Architecture

```
Client → edge-proxy (HTTP, /v1) → mTLS → API Gateway → auth → rate-limit → DNS name → proxy mTLS → service
```

- **Versioned Routing:** Pattern `/v{major}/{serviceName}/**`, allowed when `PUBLIC_ROUTES` lists it; each service serves its majors itself, an old major is removed one release after its successor (ADR-0072). Release N forwards the path without `/v{major}` (N-1 services); N+1 forwards it whole
- **Service Resolution:** the canonical service name resolved by the platform DNS to an IP (checked against `ALLOWED_PROXY_CIDRS`), port 3000; no registry, the platform spreads connections over ready pods (keep-alive: per connection). A cached GET needs no lookup. The gateway does not read `DNS_NAME_MAP`
- **Proxy:** Forwards HTTPS request via `https.request`, strips sensitive headers (`x-api-key`, `authorization`, `host`, `connection`), injects `x-forwarded-for`, `x-forwarded-proto`, `x-request-id`
- **Startup order:** needs only its SVID (readiness `svid`)

## Environment Variables

| Variable                | Default                         | Description                  |
| ----------------------- | ------------------------------- | ---------------------------- |
| `PORT`                  | `3000`                          | Service listen port          |
| `RATE_LIMIT_WINDOW_MS`  | `60000`                         | Rate limit window (ms)       |
| `RATE_LIMIT_MAX`        | `100`                           | Max requests per window      |
| `CACHE_TTL_MS`          | `30000`                         | In-memory cache TTL (ms)     |
| `AUTH_TOKEN_HEADER`     | `x-api-key`                     | Header name for auth token   |
| `AUTH_TOKENS`           | `''`                            | Comma-separated API keys `name:scope1+scope2:secret` (ADR-0059); required in production (the gateway refuses to start, as with a malformed key) |
| `PROXY_TIMEOUT_MS`      | `10000`                         | Proxy total deadline (ms)  |
| `PROXY_MAX_RESPONSE_BYTES` | `8388608` (8 MiB)          | Largest upstream answer; past it 502 `Upstream response too large` (ADR-0054) |
