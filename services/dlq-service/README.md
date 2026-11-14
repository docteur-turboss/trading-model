# DLQ Service

Stores messages the broker could not deliver, with replay, automatic retry and pruning.

- Service doc (API, config, dependencies): [docs/services/dlq-service.md](../../docs/services/dlq-service.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Environment variables: [ENV.md](../../docs/deployment/ENV.md#dlq-service--mongodb--redis)
- Run and debug locally: [local service development](../../docs/getting-started/local-service-development.md)

```bash
bun run --filter dlq-service test
```
