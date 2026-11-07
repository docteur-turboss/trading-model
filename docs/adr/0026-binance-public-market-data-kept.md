# ADR-0026: Binance Kept as the Market Data Source While Its Public API Answers From the EU

**Status:** Accepted
**Date:** 2026-10
**Verified by:** `tests/alerts/alerting.test.yml`, `packages/http/tests/unit/config/http-retry.spec.ts`, `services/financial-scraper/tests/unit/config/http.spec.ts`, `services/financial-scraper/tests/unit/job/worker/worker-orchestrator.spec.ts`, `services/trader-trainer/tests/unit/adapters/scheduler/training-loop.spec.ts`

## Context

The 13.09 audit (Décision 6) relayed a draft mentioning the closure of Binance in Europe, offered two options (migrate to a replacement broker named in the draft, Alpaca or Interactive Brokers, or check that Binance access remains available and postpone the migration) and found no source to decide. The decision taken was to check availability. Checked on 2026-10-30:

- **The closure is real but concerns accounts.** Binance holds no MiCA licence. Since 2026-07-01 it has stopped new sign-ups, deposits, new spot orders and Earn/staking for EEA residents; withdrawals remain open. It withdrew its application in Greece and plans to apply in France (AMF). Nothing announced concerns the public market data API.
- **The platform uses no Binance account.** financial-scraper only calls unsigned public endpoints: `klines`, `depth`, `trades`, `historicalTrades`, `aggTrades`, `ticker/24hr`, `ticker/price`, `ticker/bookTicker`, `ticker/tradingDay`. `BINANCE_API_KEY` and `BINANCE_API_SECRET` are declared but read by no code.
- **The public API answers from France.** On 2026-10-30, from a French IP, each of those endpoints answered HTTP 200 without any key on `api.binance.com` and on `data-api.binance.vision` (Binance's market-data-only host).
- **Binance already geo-blocks some regions** (HTTP 451 "restricted location", e.g. from the United States). That is the realistic failure mode, not an account closure.
- **The draft's replacements are brokers, not data sources.** Alpaca and Interactive Brokers both require an account (IBKR also needs market data subscriptions and a TWS/Gateway session) and do not provide a crypto order book and trade flow comparable to Binance's. MiCA-licensed exchanges (Kraken: Central Bank of Ireland, June 2025; Bitstamp: CSSF Luxembourg) publish the same kind of data through public APIs without an account.
- **Nothing tested the real source.** CI, E2E and the kind smoke test run against a Binance stub (`tests/e2e/binance-stub`, `tests/k8s/binance-stub.yaml`). A geo-block would only surface through `MarketDataStale` / `ScrapeCyclesFailing`, which do not name the cause.
- **The HTTP client retried 403 and 418.** Binance answers 403 on a WAF violation and 418 on an automatic IP ban that follows ignored 429s; retrying either extends the ban.

## Decision

1. **Binance stays the market data source**, through its public API only. No Binance account, no API key, no non-EU entity: an account is not needed to read public data, and routing through a foreign entity would only add legal exposure.
2. **A geo-block alerts by itself**: `BinanceRestrictedLocation` (critical) fires on the first 451 (`fs_binance_requests_total{status="451"}`), separately from the generic staleness alerts.
3. **The scraper never retries 403 or 418** (`isRetryableStatusPermissive`, `@trading-model/http`). 451 was already not retried. 5xx, 429, 408 and network errors are still retried with exponential backoff.
4. **Ranked fallbacks**, applied in this order when the decision is re-examined:
   1. `BINANCE_BASE_URL=https://data-api.binance.vision`: same API and payloads, configuration change only. The scraper NetworkPolicy already allows egress to any public address on 443.
   2. A MiCA-licensed exchange public API (Kraken, then Bitstamp): a second adapter implementing `MarketDataSourcePort` (Decision 6).
5. **The decision is re-examined** on the first of:
   - `BinanceRestrictedLocation` firing, or 451s reported from any deployment region;
   - a decision on Binance's MiCA application in France (granted: re-check, nothing to do; refused: re-test the public API from every deployment region);
   - a change of Binance's terms or API documentation restricting market data use from the EEA;
   - in any case, a manual re-test of the endpoints above before 2027-04-30.

6. **The scrape cycle depends on a source port, not on Binance** (done 2026-10-30, prerequisite of the multi-asset scraper, project A). The domain owns `MarketDataSourcePort` (`fetchSnapshot(SnapshotRequest): MarketDataSnapshot`) and `MarketDataPublisherPort`; `WorkerOrchestrator` fetches, publishes, then persists through them (since 2026-10-31: persists, then publishes without awaiting, see `docs/services/financial-scraper.md`). Binance is one adapter (`BinanceMarketDataSource`), publishing another (`BrokerMarketDataPublisher`), and the cron is `ScrapeCronOrchestrator`. `BinanceWorkerOptions` / `BinanceWorkerResult` became `SnapshotRequest` / `MarketDataSnapshot`. A second source is an adapter plus a `DataSource` value.
7. **The per-source read routes stay** (`/trade`, `/ticker`, `/candles`, `/orderbook` `…/sources/:source`). They were migrated to schema-described routes (ADR-0021), not removed: their old controllers were. `source` is validated against `SourceType`. They are the read side a second source needs. *Amended by [ADR-0053](./0053-order-books-persisted-not-served.md): the `/orderbook` routes are removed; order books are persisted in MySQL, not served.*
8. **No Binance credentials in the configuration**: `BINANCE_API_KEY` / `BINANCE_API_SECRET`, read by no code, are removed. A source that needs a key adds its own setting.
9. **The trainer does not train on stale data.** A symbol whose newest buffered candle closed more than `TRAINER_MAX_DATA_AGE_MS` ago (default 15 minutes, the `MarketDataStale` window) is skipped. The trainer logs one warning when a symbol goes stale and one line when it is fresh again. A symbol whose buffer is still filling is not judged.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Migrate now to Alpaca or Interactive Brokers | Brokers requiring an account and subscriptions, without equivalent crypto depth and trade data; a significant connector project for a risk that has not materialised |
| Access Binance through a non-EU entity | Not needed for public data; would look like circumventing MiCA |
| Probe the real Binance API from CI | Rejected for now (decision of 2026-10-30): CI runners do not run from the deployment region, so a green probe would prove nothing about production; the 451 alert watches the actual deployment |
| Migrate now to Kraken or Bitstamp | Same project size as any second source; deferred until a trigger in Decision 5 fires |

## Consequences

### Positive

- The platform keeps its reference source without a connector project.
- A geo-block is named within minutes by its own alert instead of being inferred from stale data.
- The scraper no longer turns a WAF violation or an IP ban into a longer ban.

### Negative

- The continuity risk remains: if Binance geo-blocks the EEA for public data too, collection stops until a fallback is applied. Fallback 1 is minutes of work but probably shares the same block; fallback 2 is an adapter to write (another exchange's payloads, symbols and rate limits), no longer a refactoring of the cycle.
- The snapshot keeps Binance's shape (6 data types, Binance symbols such as `BTCUSDT`): another exchange's adapter has to map its symbols and may leave some data types empty.
- During an outage the trainer stops training: no model is published until fresh candles arrive.
