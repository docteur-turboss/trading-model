# Architecture — api-gateway

Single external entry point for the system. Routes, authenticates, rate-limits and proxies all incoming requests to internal services.

## Operation

```
Client → /v1/{service}/... → API Gateway → auth → rate-limit → resolve DNS name → proxy mTLS → service
```

- **Versioned routing** : `/v{major}/{serviceName}/**` → resolved to its DNS name, forwarded as `/v{major}{path}` (a service answers 404 for a major it does not serve)
- **Auth** : `x-api-key` or `authorization` header, validated against a configurable list via `AUTH_TOKENS` (`name:scope1+scope2:secret` entries, ADR-0059; the client sends only the secret)
- **Rate limiting** : `express-rate-limit`, configurable (default 100 req/min)
- **Cache** : in-memory GET responses with configurable TTL
- **mTLS Proxy** : forwards the request to the target service, strips `x-api-key` from headers, configurable timeout

## Startup order

Port 8448. No dependency on another service.

## Failure impact

- **Internal services**: no impact (direct mTLS communication)
- **External**: all API requests fail
- **Recovery**: Docker restarts the container (20-50s)
