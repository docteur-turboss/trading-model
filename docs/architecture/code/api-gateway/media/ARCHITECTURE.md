# Architecture — api-gateway

Single external entry point for the system. Routes, authenticates, rate-limits and proxies all incoming requests to internal services.

## Operation

```
Client → /v1/{service}/... → API Gateway → auth → rate-limit → resolve Discovery → proxy mTLS → service
```

- **Versioned routing** : `/v{major}/{serviceName}/**` → resolved via Discovery Server, filtered by major version
- **Auth** : `x-api-key` or `authorization` header, validated against a configurable list via `AUTH_TOKENS`
- **Rate limiting** : `express-rate-limit`, configurable (default 100 req/min)
- **Cache** : in-memory GET responses with configurable TTL
- **mTLS Proxy** : forwards the request to the target service, strips `x-api-key` from headers, configurable timeout

## Startup order

Position 6 — after job-scheduler, port 8448. Depends only on `discovery-server:healthy`.

## Failure impact

- **Internal services**: no impact (direct mTLS communication)
- **External**: all API requests fail
- **Recovery**: Docker restarts the container (20-50s), re-registers with Discovery
