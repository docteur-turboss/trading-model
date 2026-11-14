# Audit Logger

Subscribes to the message bus topics, persists the events to MongoDB as a hash chain and serves queryable audit trails.

- Service doc (API, config, dependencies): [docs/services/audit-logger.md](../../docs/services/audit-logger.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Environment variables: [ENV.md](../../docs/deployment/ENV.md#audit-logger--mongodb)
- Run and debug locally: [local service development](../../docs/getting-started/local-service-development.md)

```bash
bun run --filter audit-logger test
```
