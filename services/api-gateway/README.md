# API Gateway

> Single external entry point for the trading-model platform.

## Role

Routes, authenticates, rate-limits, caches, and proxies all incoming HTTP requests to internal microservices. This is the **only** service exposed to external clients.

## Quick Start

```bash
bun run --filter api-gateway dev
```

## Configuration

| Variable                | Default                         | Description                        |
| ----------------------- | ------------------------------- | ---------------------------------- |
| `PORT`                  | `3000`                          | HTTPS listen port                  |
| `DISCOVERY_SERVICE_URL` | `https://discovery-server:3000` | Discovery server URL               |
| `RATE_LIMIT_WINDOW_MS`  | `60000`                         | Rate limit window (ms)             |
| `RATE_LIMIT_MAX`        | `100`                           | Max requests per window            |
| `CACHE_TTL_MS`          | `30000`                         | In-memory cache TTL (ms)           |
| `AUTH_TOKENS`           | `''`                            | Comma-separated valid admin tokens |
| `PROXY_TIMEOUT_MS`      | `10000`                         | Proxy request timeout (ms)         |

## API

All routes: `https://host:8448/v{major}/{serviceName}/**`

See [API doc](../../docs/services/api-gateway.md) for full endpoint reference.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Testing

```bash
bun run test
bun run test:coverage
```
