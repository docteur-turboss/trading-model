# API Gateway

Single external entry point: authenticates, rate-limits, caches and proxies the public routes to the internal services.

- Service doc (API, config, dependencies): [docs/services/api-gateway.md](../../docs/services/api-gateway.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Environment variables: [ENV.md](../../docs/deployment/ENV.md#api-gateway)
- Run and debug locally: [local service development](../../docs/getting-started/local-service-development.md)

```bash
bun run --filter api-gateway test
```
