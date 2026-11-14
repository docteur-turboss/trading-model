# Message Manager

Topic-based publish/subscribe broker over HTTP between the services, with Redis subscriptions and journal.

- Service doc (API, config, dependencies): [docs/services/message-manager.md](../../docs/services/message-manager.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md) · API: [API.md](./API.md)
- Environment variables: [ENV.md](../../docs/deployment/ENV.md#message-manager)
- Run and debug locally: [local service development](../../docs/getting-started/local-service-development.md)

```bash
bun run --filter message-manager test
```
