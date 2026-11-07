# financial-scraper — Financial Data Collector

Market data collection service from Binance, with MySQL persistence and REST API exposure. It also collects the signals of every dimension (market, fundamental, contextual, social...) declared in its source registry ([Signals](#signals-adr-0036), ADR-0036).

## General Information

| Property         | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Service name     | `financial-scraper`                                                                                    |
| Port (host)      | `8445`                                                                                                         |
| Port (container) | `3000`                                                                                                         |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, `@trading-model/broker-message`, MySQL, Binance API |

## REST Endpoints

All market data endpoints are **GET**, return one bounded **page** (ADR-0053), and answer
400 with `{ "error": "Validation failed", "details": [...] }` on an invalid
parameter. Their parameters and responses are declared in
`src/adapters/inbound/http/api-routes.ts` (`SCRAPER_API`, ADR-0021) and
published in the [OpenAPI](openapi/api-gateway.yaml); through the gateway they
are reached under the service prefix `financial-scraper` of the gateway API (v1).

| Route                                    | Returns                                           | Parameter                                   |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `/trade/sources/:source`                 | trades of a source                                | `binance`, `bloomberg` or `nyse`            |
| `/trade/symbols/:symbol`                 | trades of a symbol                                | e.g. `BTCUSDT`                              |
| `/trade/timestamp/:timestamp`            | trades at **exactly** this instant                | ISO date or date-time                       |
| `/ticker/sources/:source`                | 24h tickers of a source                           | source                                      |
| `/ticker/symbols/:symbol`                | 24h tickers of a symbol                           | symbol                                      |
| `/ticker/timestamp/:timestamp`           | 24h tickers opened at **exactly** this instant    | ISO date or date-time                       |
| `/candles/sources/:source`               | candles of a source                               | source                                      |
| `/candles/symbols/:symbol`               | candles of a symbol                               | symbol                                      |
| `/candles/timestamp/:timestamp`          | candles opened **after** this instant             | ISO date or date-time                       |
| `/orderbook/sources/:source`             | order book snapshots of a source                  | source                                      |
| `/orderbook/symbols/:symbol`             | order book snapshots of a symbol                  | symbol                                      |
| `/orderbook/after/timestamp/:timestamp`  | snapshots after this instant                      | epoch milliseconds                          |
| `/orderbook/before/timestamp/:timestamp` | snapshots before this instant                     | epoch milliseconds                          |

Every answer is bounded (ADR-0053). Query parameters:

| Parameter | Routes | Meaning |
| --------- | ------ | ------- |
| `limit` | all 13 | rows per answer, 1 to 5000, default 500 |
| `after` | trades, tickers, candles | `nextCursor` of the previous page (opaque) |
| `from`, `to` | trades, tickers, candles | optional window on `timestamp`, ISO dates, `[from, to)` |

Trades, tickers and candles answer `{ "rows": [...], "nextCursor": "..." | null,
"truncated": boolean }`, rows oldest first (ties in insertion order); follow
`nextCursor` as `after` until it is `null`. Order books answer
`{ "rows": [...], "truncated": boolean }` (no cursor).
The signals route is described in [Signals](#signals-adr-0036).

Trades, tickers and candles come from MySQL: their instants are ISO date-times
and `tradeId` (BIGINT) is a decimal string, exact past 2^53:

```json
{
  "rows": [
  {
    "symbol": "BTCUSDT",
    "market": "crypto",
    "source": "binance",
    "side": "buy",
    "price": 50000.0,
    "quantity": 0.5,
    "tradeId": "9007199254740993",
    "timestamp": "2024-01-15T10:40:00.000Z"
  }
  ],
  "nextCursor": "MTcwNTMxNTIwMDAwMC40Mg",
  "truncated": true
}
```

Tickers carry `open`, `high`, `low`, `last`, `volume`, `timestamp` and
`closeTimestamp`; candles carry `interval`, `open`, `high`, `low`, `close`,
`volume`, `trades` (absent when unknown), `timestamp` and `closeTimestamp`.

Order books are in-memory snapshots (lost on restart), timestamped in epoch
milliseconds:

```json
{
  "rows": [
  {
    "symbol": "BTCUSDT",
    "market": "crypto",
    "source": "binance",
    "timestamp": 1705315200000,
    "bids": [{ "price": 50000.0, "quantity": 1.5 }],
    "asks": [{ "price": 50010.0, "quantity": 0.8 }]
  }
  ],
  "truncated": false
}
```

## MySQL Tables

All tables live in the `financial_scraper` database (configurable via `DB_NAME` env var). The ORM is `ts-sql-query` with a custom `DBConnection` wrapper.

Three tables store market data:

| Table              | Content                   |
| ------------------ | ------------------------- |
| `market_candles`   | OHLCV candle data         |
| `market_trades`    | Individual trade data     |
| `market_tickers`   | 24-hour ticker statistics |

`market_publish_cursors` holds the candle publish backlog (see below) and
`signals` (migration 006) the signals of every dimension ([Signals](#signals-adr-0036)).

See [`docs/architecture/databases.md`](../architecture/databases.md#mysql--financial-scraper-financial-scraper) for the full column definitions, SQL DDL, composite primary keys, index conventions, and TypeScript interfaces.

## Background Jobs (Scheduled Tasks)

A `node-cron` cycle (`ScrapeCronOrchestrator`) asks the market data source (`MarketDataSourcePort`, Binance today: `BinanceMarketDataSource`, ADR-0026) for a snapshot of each symbol, persists it, then publishes it. A snapshot holds 6 data types:

1. **Candlesticks** (OHLCV candles)
2. **Recent Trades** (recent trades)
3. **Order Book Snapshot** (order book depth)
4. **Order Book Ticker** (best bid/ask)
5. **24hr Ticker Stats** (24h statistics)
6. **Price Ticker** (current price)

- `node-cron` runs the cycle with concurrency control via `p-limit`
- The Binance source fetches all 6 data types in parallel and normalizes them; `BrokerMarketDataPublisher` publishes them to the message bus
- Failures stay where they happen: a symbol that fails does not stop the others (`fs_symbols_failed_total`), and an endpoint that fails only leaves its data type out of the snapshot (`fs_snapshot_parts_failed_total{part}`): an order book error does not cost the candles. The symbol fails only when all 6 endpoints fail
- MySQL does not wait for the bus: the cycle persists, then starts the publish without awaiting it (a hung message-manager may hold a publish for `PUBLISH_ACCEPT_TIMEOUT_MS`, 15 s: it answers 202 once the message is journaled, whatever the subscribers do, ADR-0048). While a symbol's publish is in flight, the next cycles persist only (`fs_publishes_skipped_total`; their trades, tickers and order book are not published, they are snapshots)
- The candles to publish are read back from MySQL: each series has a publish cursor (`market_publish_cursors`, migration 005, open time of the next candle to publish) that moves only once a publish of its candles succeeded. Each cycle sends the next 100 persisted candles from the cursor, so a bus outage or a collector restart loses none (`fs_unpublished_candles{symbol}` counts those waiting, alert `MarketDataUnpublished`). A series without a cursor starts at the first candle the process persists, not at the history. If the backlog cannot be read (MySQL down) the other data types still go out. On shutdown the scraper stops the cron and waits for the running cycle and the publishes in flight (collector grace period 360 s)
- Candles are fetched from a per-symbol cursor (`startTime` = close of the last persisted candle + 1 ms), so each cycle publishes only the candles closed since the previous one and catches up after an outage. The still-open candle is never published. The cursor lives in memory: after a restart the first cycle sends the latest window again, which the upserts and the trainer absorb

### Rate Limiting

- Algorithm: **Token Bucket** — respects Binance API weight costs per endpoint
- Retry strategy: **exponential backoff** (5 retries, 300ms–10s)
- Prevents Binance API bans

## Signals (ADR-0036)

A signal is one observation about an asset or a whole sector, in one
dimension (`market`, `fundamental`, `social`, `contextual`, `legal`, `macro`).
Schema v1, the model of the design note's §1: `src/domain/signals.ts`
(`SIGNAL_SCHEMA_VERSION`).

- **Asset**: `assetType` (`crypto`, `equity`, `bond`, `real_estate`, `etf`,
  `commodity_proxy`), a polymorphic `identifier` (`ticker` with an optional
  exchange MIC, `isin`, `contract`, `insee`, `series`), the
  `applicableDimensions` (signals of other dimensions are neither collected nor
  served for it) and its `sector`.
- **Source**: `protocol` (only `rest_api` has a worker), `covers` (the
  (asset type, dimension) pairs it can feed), `accessPolicy`,
  `reliabilityScore`, an adapter, a cron `schedule` and its requests (subject
  `assetId` or `sector`, `dimension`, HTTPS URL, adapter `params`). A URL may
  hold `{date-N}`: the UTC date N days before the collection, as YYYYMMDD.
- **Signal**: an envelope (`sourceId`, `dimension`, `assetId` or `sector`,
  `observedAt`, `ingestedAt`, `confidenceScore`) and the canonical `payload` of
  its dimension: a measure (`metric`, `value`, `unit`, optional `details`) plus
  `period` (market, optional), `period` and `filing` (fundamental), `platform`,
  `topic` and `period` (social), `location` (contextual), `jurisdiction`
  (legal), `area` and `period` (macro).

**Sources** are declared in `src/config/signal-registry.json` (assets and
sources), checked at startup: a broken registry stops the service. A
request's dimension must be covered by its source for the asset type of its
subject, apply to that asset, and be written by the adapter.

Every source must be free for any use, trading included:
`accessPolicy.terms` is `public-domain` or `attribution` (with the credit to
give), and `termsUrl` points to the terms read; `auth` is `none` and
`maxRequestsPerMinute` spaces the requests of the source. Other terms
(non-commercial, research only) cannot be declared: Open-Meteo's free API and
Binance's `data-api.binance.vision` (CC BY-NC-SA 4.0) were rejected for that.

| Source id | Dimension | Subject | Schedule | Metrics | Terms |
| --- | --- | --- | --- | --- | --- |
| `ecb-aaa-yield-10y` | market | `EA_AAA_10Y` (bond) | daily 15:07 UTC, weekdays (after the ECB release) | `spot_rate_10y` | attribution: "Source: ECB statistics" |
| `sec-edgar-eps-diluted` | fundamental | `AAPL` | daily | `us-gaap:EarningsPerShareDiluted` | attribution: SEC |
| `nws-kansas-wheat-belt` | contextual | sector `agriculture` | hourly (stations report once an hour) | `temperature`, `relativeHumidity`, `precipitationLast*` | public domain |
| `wikipedia-pageviews` | social | `BTC`, `ETH` | daily | `pageviews` | public domain (CC0) |

**Adding a source**: read its terms, then an entry in the registry. A new
payload format also needs an adapter in `src/adapters/outbound/signal-sources/`
(a Zod schema of the payload and a `normalize` function returning
observations) and its line in `SOURCE_ADAPTERS`. Nothing else changes.

**Collection** runs on the collector instance only (`SCRAPE_SCHEDULER_ENABLED`)
and when `SIGNAL_COLLECTION_ENABLED` is not `false` (CI turns it off): one cron
task per source, requests one after the other, an overlapping tick skipped.
Each request is fetched (GET, JSON, 10 s timeout, no retry: the next tick is the
retry), normalized by its adapter, checked against the schema and stored.
`fs_signal_collections_total{source,result}` counts the requests by result:
`success`, `fetch_error`, `invalid_payload` (the source changed its format: logged,
nothing stored), `store_error`. Every request sends the User-Agent
`automated news analysis <SIGNAL_CONTACT_EMAIL>`: SEC EDGAR answers 403
without the e-mail; NWS and Wikimedia accept the repository URL sent when it
is unset. The repository is public, so the e-mail is never committed: `.env`
for compose, the GitHub environment secret `SIGNAL_CONTACT_EMAIL` for K8s
(`deploy.yml` writes it into the `signal-contact` ConfigMap). A value that
is no e-mail address disables the signal collection (error logged at start);
the Binance collection goes on.

**Point in time**: `observedAt` is never earlier than the value was public:
the source's own time when it gives a safe one (an EDGAR fact once its filing
day is over, US Eastern), otherwise the first collection that saw the value
(the ECB, NWS and Wikimedia give no release time; the store keeps that first
row). The NWS measurement time, earlier than its publication, is in
`details.measuredAt`. The period a value refers to is in the payload
(`period`). `confidenceScore` is the source's
`reliabilityScore` when collected. Both are served with every signal, never
filtered on.

**Storage**: table `signals`. `id` is the sha256 of source, subject, metric and
the observation key, so a replayed collection stores nothing twice (the first
value stays). A sector signal is stored once, with `sector` set and
`asset_id` null.

**Query**: `GET /signals/assets/:assetId?from=<date>&to=<date>` (through the
gateway: `/v1/financial-scraper/signals/assets/:assetId`). `from` and `to` are
ISO dates or date-times, the window is `[from, to)`. The answer holds the asset,
then its own and its sector's signals of its applicable dimensions in the
window, oldest first, at most 5000 (`truncated: true` beyond: narrow the
window); an asset the registry does not know answers 404.

**Attribution**: the answer carries `sourceId`, not the credit of the
`attribution` sources (ECB, SEC). Its clients are internal only: the trainer,
and the admin dashboard behind the gateway (the whole platform is internal).
Whatever shows or publishes their values outside gives the registry's
`accessPolicy.attribution` text.

**Consumers**: the data supply collects and serves every source; a consumer
picks what it uses. The trainer (next phase) calls this route directly over
mTLS (the scraper ACL admits `trader-trainer`), one training window at a time,
maps its symbols to registry assets (`BTCUSDT` → `BTC`) and chooses its
dimensions and metrics: nothing changes here (ADR-0036, decision 14).

```json
{
  "asset": {
    "id": "WHEAT",
    "name": "Wheat, through the Teucrium Wheat Fund",
    "assetType": "commodity_proxy",
    "identifier": { "scheme": "ticker", "ticker": "WEAT", "exchange": "ARCX" },
    "applicableDimensions": ["market", "contextual", "macro"],
    "sector": "agriculture"
  },
  "signals": [
    {
      "id": "2be2…",
      "schemaVersion": 1,
      "sourceId": "nws-kansas-wheat-belt",
      "dimension": "contextual",
      "assetId": null,
      "sector": "agriculture",
      "observedAt": "2026-11-04T13:05:00.412Z",
      "ingestedAt": "2026-11-04T13:05:00.412Z",
      "confidenceScore": 0.8,
      "payload": {
        "metric": "temperature",
        "value": 4,
        "unit": "wmoUnit:degC",
        "location": { "latitude": 38.07, "longitude": -97.87, "name": "KHUT" },
        "details": { "qualityControl": "V", "measuredAt": "2026-11-04T12:40:00+00:00" }
      }
    }
  ],
  "truncated": false
}
```

## Architecture

```
HTTP Server
  ├── Financial routes (/trade/*, /ticker/*, /candles/*, /orderbook/*, /signals/assets/*)
  ├── AddressManager routes (ping)
  └── MessageManager routes (callback)

Background
  ├── WorkerOrchestrator (per symbol)
  │     ├── MarketDataSourcePort → Binance public API (token bucket)
  │     ├── MarketDataPublisherPort → message bus
  │     └── MySQL write
  └── SignalCronScheduler (per registry source)
        └── SignalCollector: rest_api worker → source adapter → schema check → MySQL signals

Dependencies
  ├── MySQL (persistence)
  ├── discovery-server (registration)
  └── message-manager (event publication)
```
