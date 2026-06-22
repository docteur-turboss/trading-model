# api-gateway — API Gateway

Single external entry point for the system. Routes, authenticates, rate-limits, and proxies all incoming requests to internal services.

## General Information

| Property         | Value                                     |
| ---------------- | ----------------------------------------- |
| Service name     | `api-gateway`                             |
| Port (host)      | `8448`                                    |
| Port (container) | `3000`                                    |
| Dependencies     | `@trading-model/common`, discovery-server |

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

**`\* /v{version}/{serviceName}/**`\*\*

Proxies all HTTP methods (GET, POST, PUT, DELETE, etc.) to the target internal service. The version and service name are resolved via the Discovery Server.

**Headers:**

| Header          | Required | Description                |
| --------------- | -------- | -------------------------- |
| `x-api-key`     | Yes\*    | API key for authentication |
| `authorization` | No       | Fallback auth header       |

\*All routes except `/ping` require authentication via `x-api-key` (or `authorization` fallback). Validated against `AUTH_TOKENS`.

**Response (success):** Proxied response from target service (status code and body forwarded as-is).

**Response (errors):**

| Status | Condition            | Body                                                        |
| ------ | -------------------- | ----------------------------------------------------------- |
| `400`  | Invalid route        | `{ "error": "Invalid route format" }`                       |
| `401`  | Missing/invalid auth | `{ "error": "Unauthorized" }`                               |
| `429`  | Rate limited         | `{ "error": "Too many requests", "retryAfter": <seconds> }` |
| `404`  | Service not found    | `{ "error": "Service not found" }`                          |
| `503`  | Service unavailable  | `{ "error": "Service unavailable" }`                        |

## Rate Limiting

- **Algorithm:** `express-rate-limit` (sliding window)
- **Default:** 100 requests per 60s window (configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`)
- **Response:** `429 Too Many Requests` with `retryAfter` in seconds

## Caching

- In-memory GET response cache (status 200 only)
- Default TTL: 30s (configurable via `CACHE_TTL_MS`)

## Architecture

```
Client → /v{major}/{service}/... → API Gateway → auth → rate-limit → resolve Discovery → proxy mTLS → service
```

- **Versioned Routing:** Pattern `/v{major}/{serviceName}/**` — resolved via Discovery Server, filtered by major version
- **Service Resolution:** `ServiceResolver` queries Discovery Server, caches results with configurable TTL, round-robin load balancing across instances
- **Proxy:** Forwards HTTPS request via `https.request`, strips sensitive headers (`x-api-key`, `authorization`, `host`, `connection`), injects `x-forwarded-for`, `x-forwarded-proto`, `x-request-id`
- **Startup order:** Position 6 (depends on discovery-server:healthy)

## Environment Variables

| Variable                | Default                         | Description                  |
| ----------------------- | ------------------------------- | ---------------------------- |
| `PORT`                  | `3000`                          | Service listen port          |
| `DISCOVERY_SERVICE_URL` | `https://discovery-server:3000` | Discovery server URL         |
| `RATE_LIMIT_WINDOW_MS`  | `60000`                         | Rate limit window (ms)       |
| `RATE_LIMIT_MAX`        | `100`                           | Max requests per window      |
| `CACHE_TTL_MS`          | `30000`                         | In-memory cache TTL (ms)     |
| `AUTH_TOKEN_HEADER`     | `x-api-key`                     | Header name for auth token   |
| `AUTH_TOKENS`           | `''` (empty = no auth)          | Comma-separated valid tokens |
| `PROXY_TIMEOUT_MS`      | `10000`                         | Proxy request timeout (ms)   |
