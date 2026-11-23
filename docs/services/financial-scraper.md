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

All market data endpoints are **GET**, return one bounded **page** (ADR-0054), and answer
400 with `{ "error": "Validation failed", "details": [...] }` on an invalid
parameter. Their parameters and responses are declared in
`src/adapters/inbound/http/api-routes.ts` (`SCRAPER_API`, ADR-0021) and
published in the [OpenAPI](openapi/api-gateway.yaml); through the gateway they
are reached under the service prefix `financial-scraper` of the gateway API (v2 since release 3.0.0).

A client of 2.x must migrate: see [Breaking changes in 3.0.0](#breaking-changes-in-300-gateway-api-v2).

| Route                                    | Returns                                           | Parameter                                   |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `/v2/trade/symbols/:symbol`                 | trades of a symbol                                | e.g. `BTCUSDT`                              |
| `/v2/trade/timestamp/:timestamp`            | trades at **exactly** this instant                | ISO date or date-time                       |
| `/v2/ticker/symbols/:symbol`                | 24h tickers of a symbol                           | symbol                                      |
| `/v2/ticker/timestamp/:timestamp`           | 24h tickers opened at **exactly** this instant    | ISO date or date-time                       |
| `/v2/candles/symbols/:symbol`               | candles of a symbol                               | symbol                                      |
| `/v2/candles/timestamp/:timestamp`          | candles opened **after** this instant             | ISO date or date-time                       |

Every answer is bounded (ADR-0054). Query parameters:

| Parameter | Routes | Meaning |
| --------- | ------ | ------- |
| `limit` | all 9 | rows per answer, 1 to 5000, default 500 |
| `after` | trades, tickers, candles | `nextCursor` of the previous page (opaque) |
| `from`, `to` | trades, tickers, candles | optional window on `timestamp`, ISO dates, `[from, to)` |

Trades, tickers and candles answer `{ "rows": [...], "nextCursor": "..." | null,
"truncated": boolean }`, rows oldest first (ties in insertion order); follow
`nextCursor` as `after` until it is `null`. The signals route is described in [Signals](#signals-adr-0036).

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

Order books have no route (ADR-0053): the collector writes each snapshot to
`market_order_books` for historical replay; nothing reads them yet. No process keeps them in memory.

### Breaking changes in 3.0.0 (gateway API v2)

Release 3.0.0 moves the public routes of the service from the version prefix
`v1` to `v2`: it serves major version 2
(`APP_VERSION=2.0.0`), so the gateway serves it under `v2` only and the same
route under `v1` answers 404. The signals route is unchanged apart from that
prefix. A client of 2.x must change:

- **Removed** (#577, ADR-0053), answer 404: `/orderbook/after/timestamp/{timestamp}`,
  `/orderbook/before/timestamp/{timestamp}`, `/orderbook/sources/{source}`,
  `/orderbook/symbols/{symbol}`.
- **Paged** (#576, ADR-0054): the 9 trade, ticker and candle routes above
  answered the whole result as a JSON array. They now answer
  `{ rows, nextCursor, truncated }` with at most `limit` rows (default 500):
  read `rows`, and follow `nextCursor` as `after` until it is `null` to get
  everything.

## MySQL Tables

All tables live in the `financial_scraper` database (configurable via `DB_NAME` env var). The ORM is `ts-sql-query` with a custom `DBConnection` wrapper.

Four tables store market data:

| Table              | Content                   |
| ------------------ | ------------------------- |
| `market_candles`   | OHLCV candle data         |
| `market_trades`    | Individual trade data     |
| `market_tickers`   | 24-hour ticker statistics |
| `market_order_books` | Order book depth snapshots (migration 008, ADR-0053): `bids` / `asks` as JSON `[price, quantity]` pairs, best first; no API route reads them |

`market_publish_cursors` is unused (dropped in release N+1, ADR-0040) and
`signals` (migration 006) the signals of every dimension ([Signals](#signals-adr-0036)).

See [`docs/architecture/databases.md`](../architecture/databases.md#mysql--financial-scraper) for the full column definitions, SQL DDL, composite primary keys, index conventions, and TypeScript interfaces.

## Background Jobs (Scheduled Tasks)

A `node-cron` cycle (`ScrapeCronOrchestrator`) asks the market data source (`MarketDataSourcePort`, Binance today: `BinanceMarketDataSource`, ADR-0026) for a snapshot of each symbol, persists it. Nothing is published on the bus (ADR-0078). A snapshot holds 6 data types:

1. **Candlesticks** (OHLCV candles)
2. **Recent Trades** (recent trades)
3. **Order Book Snapshot** (order book depth)
4. **Order Book Ticker** (best bid/ask)
5. **24hr Ticker Stats** (24h statistics)
6. **Price Ticker** (current price)

- `node-cron` runs the cycle with concurrency control via `p-limit`
- The Binance source fetches all 6 data types in parallel and normalizes them
- Failures stay where they happen: a symbol that fails does not stop the others (`fs_symbols_failed_total{symbol}` and `fs_symbols_scraped_total{symbol}`, born at 0 for every tracked symbol), and an endpoint that fails only leaves its data type out of the snapshot (`fs_snapshot_parts_failed_total{part}`): an order book error does not cost the candles. A payload that cannot be normalized (a value outside its domain type) only loses its data type too, counted on the same metric. The symbol fails only when all 6 endpoints fail. So a symbol can count as scraped with no candle: alert `SymbolMarketDataStale` reads `fs_candles_persisted_total{symbol}` (born at 0 for every tracked symbol) and names a symbol with no candle persisted for 15 min, whatever the cause, even when the cycle counts `success`
- Candles are fetched from a per-symbol cursor (`startTime` = close of the last persisted candle + 1 ms), so each cycle persists only the candles closed since the previous one and catches up after an outage. The cursor lives in memory: the first cycle of a process starts it at the open time of the newest candle of the series in MySQL (read once; MySQL down: latest window, read again next cycle), so a stop of any length is caught up 100 candles per cycle; the candle read again is absorbed by the upserts and the trainer

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
  hold `{date-N}`: the UTC date N days before the collection, as YYYYMMDD; `{year}`: its UTC year.
- **Signal**: an envelope (`sourceId`, `dimension`, `assetId` or `sector`,
  `observedAt`, `ingestedAt`, `confidenceScore`) and the canonical `payload` of
  its dimension: a measure (`metric`, `value`, `unit`, optional `details`) plus
  `period` (market, optional), `period` and `filing` (fundamental), `platform`,
  `topic` and `period` (social), `location` (contextual), `jurisdiction`
  (legal), `area` and `period` (macro).

**Sources** are declared in `src/config/signal-registry.json` (assets and
sources), checked at startup: a broken registry stops the service. Deployed
pods read the same repository file from `SIGNAL_REGISTRY_FILE` (K8s ConfigMap
`financial-scraper-signal-registry`, compose bind mount), so an asset or source
of a known format ships with a deploy, without a new image (issue #1308). A
request's dimension must be covered by its source for the asset type of its
subject, apply to that asset, and be written by the adapter.

Every source must be free (ADR-0075), by order of preference: rank 1, free for
any use, trading included (`accessPolicy.terms` `public-domain` or
`attribution`, with the credit to give); rank 2, free for personal or research
use only (`non-commercial`), kept only if no rank 1 source gives the same data.
A `non-commercial` source carries `restrictions` (clause read, with date) and
`commercialLicence` (`available` with `commercialLicenceUrl`, `unavailable`,
`unknown`); the other terms refuse both. `termsUrl` points to the terms read;
`auth` is `none` and `maxRequestsPerMinute` spaces the requests. A source paid
for the use made, or with no terms found, cannot be declared. The gauge
`fs_signal_sources{terms,commercial_licence}` and a startup log name the
`non-commercial` sources. Open-Meteo's free API and Binance's
`data-api.binance.vision` (CC BY-NC-SA 4.0) are rank 2 candidates, not added yet.

| Source id | Dimension | Subject | Schedule | Metrics | Terms (rank; commercial licence) |
| --- | --- | --- | --- | --- | --- |
| `ecb-aaa-yield-10y` | market | `EA_AAA_{2,10,30}Y` (bond) | daily 15:07 UTC, weekdays (after the ECB release) | `spot_rate_{2,10,30}y` | attribution: "Source: ECB statistics" (1) |
| `treasury-par-yield-curve` | market | `US_TREASURY_{2,10,30}Y` (bond) | weekdays 21:17-23:17 UTC (CSV of the year, one row per business day) | `par_yield_{2,10,30}y` (percent) | public domain, work of the US government (17 U.S.C. 105) (1) |
| `ecb-hicp-annual-rate` | macro | area `EA` | daily 11:17 UTC (HICP is monthly) | `hicp_annual_rate` | attribution: "Source: ECB statistics" (1) |
| `ecb-deposit-facility-rate` | macro | area `EA` | weekdays 15:35 UTC (changes are irregular) | `deposit_facility_rate` | attribution: "Source: ECB statistics" (1) |
| `ecb-euro-reference-rates` | macro | area `EA` | weekdays 16:07 UTC (after the ECB release) | `eur_{usd,gbp,chf,jpy}_reference_rate` | attribution: "Source: ECB statistics" (1) |
| `fred-us-macro` | macro | area `US` (AAPL, MSFT, JPM, XOM, JNJ, WHEAT, GLD) | daily 13:47 UTC; key `SIGNAL_KEY_FRED`, 1000 requests a day declared (FRED sets none) | `DFF` fed funds rate (Board of Governors, daily), `CPIAUCSL` CPI (BLS, monthly), `UNRATE` unemployment (BLS, monthly), `GDPC1` real GDP (BEA, quarterly); `observedAt` = vintage `realtime_start`, a revision is a second signal. Left out: ICE BofA credit spreads (third-party copyright) | attribution: FRED notice (read 2026-11-16, terms_of_use.html: third-party series need the owner's permission, agency series are public domain by origin) (1) |
| `sec-edgar-eps-diluted` | fundamental | `AAPL`, `MSFT`, `JPM`, `XOM`, `JNJ` | daily | `us-gaap:EarningsPerShareDiluted` | attribution: SEC (1) |
| `sec-edgar-revenue` | fundamental | equities with a `cik` alias | daily | `us-gaap:Revenues` (tags `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`) | attribution: SEC (1) |
| `sec-edgar-core-facts` | fundamental | equities with a `cik` alias | daily | `us-gaap:{OperatingIncomeLoss,NetIncomeLoss,Assets,Liabilities,StockholdersEquity,CashAndCashEquivalentsAtCarryingValue}`, `dei:EntityCommonStockSharesOutstanding` | attribution: SEC (1) |
| `cftc-cot-legacy` | market | `WHEAT` (contract 001602) | Fridays and Mondays after a holiday, hourly 15:45-23:45 UTC | `net_position_funds`, `net_position_producers`, `open_interest`; `observedAt` = release 15:30 ET, 3 business days after the Tuesday | public domain, CFTC acknowledged (1) |
| `nws-kansas-wheat-belt` | contextual | sector `agriculture` | hourly (stations report once an hour) | `temperature`, `relativeHumidity`, `precipitationLast*` | public domain (1) |
| `nasa-power-crop-regions` | contextual | sector `agriculture` | daily (5 points: Beauce, Poltava, Mato Grosso, Rio Grande do Sul, Riverina) | `T2M`, `PRECTOTCORR`, `GWETROOT` (latest day with a value, observations only) | attribution (NASA POWER) |
| `wikipedia-pageviews` | social | `BTC`, `ETH`, `AAPL`, `MSFT`, `JPM`, `XOM`, `JNJ` | daily | `pageviews` | public domain (CC0) (1) |
| `eia-weekly-energy` | contextual | sector `energy` (`XLE`) | Wednesdays and Thursdays, hourly 14:35-22:35 UTC (report Wednesday 10:30 ET, Thursday after a holiday) | `crude_oil_stocks`, `gasoline_stocks`, `natural_gas_storage`, `crude_oil_production` (series `WCESTUS1`, `WGTSTUS1`, `NW2_EPG0_SWO_R48_BCF`, `WCRFPUS2`); key `SIGNAL_KEY_EIA` (query `api_key`), 500 requests a day (EIA documents no figure); `observedAt` = report time for the newest petroleum week only (gas: collection time, its report is Thursday); value in the key: a revision is a second signal | public domain, EIA acknowledged (read 2026-11-16) (1) |
| `dvf-commune-sales` | market | `BORDEAUX_RE`, `NANTES_RE`, `LILLE_RE`, `MONTPELLIER_RE` (INSEE communes) | Mondays 06:17 UTC (DVF is published twice a year, URL year `2025` to bump by hand) | `sales_count`, `median_price_per_m2_apartment`, `median_price_per_m2_house`; per commune and year, one sale counted once; sales without price or surface, or with several dwellings of different surfaces, only in `details.excluded`; several dwelling rows of the same type and surface count as one dwelling (the file cannot tell two identical flats from one on two lots: about 1 % of kept sales on the 2025 files, price/m2 overstated for a real twin sale); a corrected value is a second signal; no sale-level field is stored | attribution: DGFiP / Etalab, Licence Ouverte 2.0 (1) |
| `eurostat-house-price-index`, `eurostat-hicp-inflation`, `eurostat-unemployment` | macro | areas `EA`, `FR`, `DE` (served to `PARIS_RE` through its `areas`) | daily 08:23-08:37 UTC | `house_price_index` (quarterly, `prc_hpi_q`), `hicp_annual_rate` (`prc_hicp_minr`), `unemployment_rate` (`une_rt_m`) | attribution: "Source: Eurostat" (1) (2026-11-16, [copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice): commercial reuse allowed with the source credited); `observedAt` = the dataset `updated` time, a revised value is a new signal, the Eurostat flag is in `details.flag` |
| `federal-register-documents` | legal | sectors `crypto` (SEC, CFTC), `technology` (FTC) | daily | `documents_final_rules`, `documents_proposed_rules`, `documents_notices` | public domain (US government work, govinfo policy, read 2026-11-16) |

EDGAR facts use `companyconcept`, one request per concept and company (10 per
company a day, under the 10 requests/s fair-access limit and `maxRequestsPerMinute`):
`companyfacts` answers several MB per company, past the 5 MB body cap. A concept a
company never reported answers 404: the EDGAR sources set `notFoundIsEmpty`, so a 404 is
`not_found` (no fact), not a fetch failure, and quarantines nothing. Units
stay as filed (`USD`, `USD/shares`, `shares`), never converted.

**Adding a source**: read its terms, then an entry in the registry. A new
payload format also needs an adapter in `src/adapters/outbound/signal-sources/`
(a Zod schema of the payload and a `normalize` function returning
observations) and its line in `SOURCE_ADAPTERS`. Nothing else changes.

**Collection** runs on the collector instance only (`SCRAPE_SCHEDULER_ENABLED`)
and when `SIGNAL_COLLECTION_ENABLED` is not `false` (CI turns it off): one cron
task per source, requests one after the other, an overlapping tick skipped.
Each request is fetched (GET, JSON, 10 s timeout, no retry: the next tick is the
retry, unless the source is quarantined, see runbook-market-data-stale),
normalized by its adapter, checked against the schema and stored.
`fs_signal_collections_total{source,result}` counts the requests by result:
`success`, `not_modified` (304: nothing to store, counts as fresh), `not_found` (404 on a source with `notFoundIsEmpty`: no fact, not a failure), `fetch_error`, `invalid_payload` (the source changed its format: logged,
nothing stored), `store_error`. Every request sends the User-Agent
`automated news analysis <SIGNAL_CONTACT_EMAIL>`: SEC EDGAR answers 403
without the e-mail; NWS and Wikimedia accept the repository URL sent when it
is unset. The address must be functional and non-nominative (project alias, never a person's e-mail: it is sent to US sources). The repository is public, so the e-mail is never committed: `.env`
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

**Query**: `GET /v2/signals/assets/:assetId?from=<date>&to=<date>` (through the
gateway: `/v2/financial-scraper/signals/assets/:assetId`). `from` and `to` are
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
  ├── Financial routes (/trade/*, /ticker/*, /candles/*, /signals/assets/*)
  ├── AddressManager routes (ping)

Background
  ├── WorkerOrchestrator (per symbol)
  │     ├── MarketDataSourcePort → Binance public API (token bucket)
  │     └── MySQL write
  └── SignalCronScheduler (per registry source)
        └── SignalCollector: rest_api worker → source adapter → schema check → MySQL signals

Dependencies
  └── MySQL (persistence)
```
