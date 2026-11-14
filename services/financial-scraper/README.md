# Financial Scraper

Fetches market data from Binance and signal sources, persists it to MySQL and publishes it on the message bus.

- Service doc (API, config, dependencies): [docs/services/financial-scraper.md](../../docs/services/financial-scraper.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Environment variables: [ENV.md](../../docs/deployment/ENV.md#financial-scraper--market-data)
- Run and debug locally: [local service development](../../docs/getting-started/local-service-development.md)

```bash
bun run --filter financial-scraper test
```
