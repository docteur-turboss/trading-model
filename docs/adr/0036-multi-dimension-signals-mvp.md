# ADR-0036: Multi-Dimension Signals MVP — Frozen Schema, Static Source Registry, Generic `rest_api` Worker

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0026](./0026-binance-public-market-data-kept.md) (Binance public data, source port), [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (API schemas), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) (reachability gate), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point-in-time data)
**Verified by:** `services/financial-scraper/tests/unit/signals/signal-registry.spec.ts`, `services/financial-scraper/tests/unit/signals/source-adapters.spec.ts`, `services/financial-scraper/tests/unit/signals/signal-collector.spec.ts`, `services/financial-scraper/tests/unit/clients/http/api-routes.spec.ts`, `services/financial-scraper/tests/db/market-data.db.spec.ts`

## Context

The platform collects one dimension from one source: Binance market data (ADR-0026), in Binance's shape, consumed per symbol by the trainer. A design note asks to widen collection to every kind of data that moves an asset: `market`, `fundamental`, `macro`, real estate, `contextual` (weather, agriculture, news), `social`, `legal`, from free sources only. Its MVP is meant to validate the abstraction, not to cover sources:

1. a frozen, versioned `Asset` / `Dimension` / `Source` / `Signal` schema;
2. a static source registry (JSON or YAML, no admin UI);
3. one worker per protocol, `rest_api` first, with four test sources, one per dimension: `market` (Binance), `fundamental` (e.g. SEC EDGAR), `contextual` (e.g. Open-Meteo), `social` (e.g. RSS or Reddit);
4. a simple scheduler (a cron is enough);
5. a normalizer with one adapter per test source;
6. basic storage ("a TSDB for market data, a document store for the rest", no graph store);
7. a serving API: the signals of an `asset_id`, every dimension, over a time window.

Success criterion: a fifth source, of any dimension, needs a registry entry and an adapter, and no change to the scheduler, the bus or the store.

Two requirements of the note concern the consumers and shape the schema:

- `confidence_score` and freshness (`observed_at`) are features in their own right, not upstream filters: an Analyst must learn to weigh a 3-month-old fundamental differently from a 3-second-old price.
- Sector-wide `contextual` data (weather: every agricultural asset, not only wheat) belongs to Sector Managers, rather than being duplicated for each Asset Analyst.

Checked on 2026-11-04:

- `data-api.binance.vision/api/v3/ticker/24hr`, Open-Meteo `v1/forecast?current=...` and Mastodon `GET /api/v1/tags/:name` answer 200 without key. SEC EDGAR answers 403 ("Undeclared Automated Tool") to a User-Agent without contact: its fair access policy requires `"<organisation> <contact e-mail>"`.
- Reddit's API terms require a registered OAuth application; RSS is XML, which `rest_api` (JSON) does not parse without a new dependency.
- The platform has MySQL (market data, backed up daily with hourly PITR archives) and MongoDB (audit, DLQ), no time-series database. financial-scraper only talks to MySQL, and already splits HTTP replicas from a single collector pod.
- No Analyst or Sector Manager exists: the trainer is a GA + DQN per symbol, fed by market data only.

## Decision

1. **Schema v1** (`services/financial-scraper/src/domain/signals.ts`, Zod, `SIGNAL_SCHEMA_VERSION = 1`). A change that breaks a reader of the registry or of stored or served signals bumps the version.
   - `Dimension`: `market`, `fundamental`, `macro`, `real_estate`, `contextual`, `social`, `legal`: every dimension of the note, so a fifth source needs no schema change whatever its dimension.
   - `Asset`: `id` (upper case), `name`, `assetClass` (`crypto`, `equity`, `etf`, `commodity`, `real_estate`), `sector`.
   - `Source`: `id`, `dimension`, `protocol`, `adapter`, `schedule` (cron), `reliabilityScore` (0–1), `requests` (subject, HTTPS URL, adapter `params`).
   - `Signal`: `id`, `schemaVersion`, `sourceId`, `dimension`, `assetId` or `sector` (exactly one), `metric`, `value` (a number), `unit`, `observedAt`, `collectedAt`, `confidenceScore`, `attributes` (flat, source-specific).
   - Fields are camelCase on the wire, like the rest of the API (`observed_at` becomes `observedAt`, `confidence_score` `confidenceScore`, `asset_id` `assetId`); MySQL columns are snake_case.
2. **Confidence and freshness are stored and served, never filtered on.** `confidenceScore` is the source's `reliabilityScore` at collection time, a prior: SEC EDGAR 0.95, Binance 0.9, Open-Meteo 0.7, Mastodon 0.3 (social data is low-confidence by default). `observedAt` is point-in-time: when the value was true or public, not when it was fetched. An EDGAR fact is observed at the end of its filing day (US Eastern, 05:00 UTC the next day), not at the end of its period; a Mastodon day count once the UTC day is over (today's count is left for later collections). A consumer computes the age as now minus `observedAt`.
3. **A request is about an asset or a whole sector.** A sector signal is stored once (`sector` set, `asset_id` null) and served with the signals of every asset of the sector: the weather of the US wheat belt is an `agriculture` signal, not a `WHEAT` one.
4. **Static registry** `services/financial-scraper/src/config/signal-registry.json`, bundled in the image and parsed at startup by `parseSignalRegistry` (`src/config/signal-registry.ts`): the schema, then unique ids, known subjects and adapters, valid cron expressions, adapter `params`. Every problem is reported at once and a broken registry stops the service.
5. **One worker per protocol.** Only `rest_api` exists (`src/adapters/outbound/signal-sources/rest-api.worker.ts`): GET, JSON body, 10 s timeout, no retry (the next tick of the source is the retry). The schema refuses a protocol without a worker.
6. **Normalizer: one adapter per source format** (`SOURCE_ADAPTERS`). An adapter validates its payload with Zod and returns observations; the collector (`src/application/signal-collector.ts`) completes them into signals and checks each against the schema. A payload that does not match, or a body that is not JSON, is logged and counted `invalid_payload` in `fs_signal_collections_total{source,result}`: never stored half-parsed, never dropped silently.
7. **Scheduler: one node-cron task per source**, on its own schedule (`src/adapters/inbound/cron/signal.cron.ts`): a slow or failing source never delays another, an overlapping tick is skipped, requests of a source run one after the other. It runs where the scrape cron runs (`SCRAPE_SCHEDULER_ENABLED`: the collector pod) and only if `SIGNAL_COLLECTION_ENABLED` (default `true`). CI turns it off (E2E overlay, `tests/k8s/ci-render.mjs`, which fails if it is not off): the test sources are real public APIs.
8. **One MySQL table, `signals`** (migration 006, database `financial_scraper`), for every dimension: numeric `value` plus a JSON `attributes` column for the document part. `id` is the sha256 of source, subject, metric and the observation's key; inserts use `ON DUPLICATE KEY UPDATE id = id`, so a replayed collection stores nothing twice and the first value stays. A CHECK constraint enforces one subject per row. The candle, trade and ticker tables stay the high-frequency market store.
9. **Serving API** `GET /signals/assets/:assetId?from=&to=` (public: `GET /v1/financial-scraper/signals/assets/:assetId`): the registry asset, then its own and its sector's signals observed in `[from, to)`, oldest first, at most 5000 per answer (`truncated: true` beyond: narrow the window). Unknown asset: 404.
10. **No publication on the message bus** in the MVP: nothing consumes signals yet.
11. **Test sources** (one per dimension of the MVP):

    | Source | Dimension | Subject | Schedule |
    | --- | --- | --- | --- |
    | Binance 24 h ticker, `BTCUSDT`, `ETHUSDT` | `market` | `BTC`, `ETH` | every 5 min |
    | SEC EDGAR companyconcept, Apple `us-gaap:EarningsPerShareDiluted` | `fundamental` | `AAPL` | every 6 h |
    | Open-Meteo current temperature and precipitation, central Kansas | `contextual` | sector `agriculture` | every 15 min |
    | Mastodon hashtag history `#bitcoin`, `#ethereum` (mastodon.social, counts only) | `social` | `BTC`, `ETH` | every 6 h |

    Every request sends `SIGNAL_USER_AGENT`; SEC EDGAR needs a contact in it.

Adding a source of a known format is an entry in `signal-registry.json`. A new format also needs an adapter in `src/adapters/outbound/signal-sources/` and its line in `SOURCE_ADAPTERS`. The scheduler, the store and the API do not change.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| A new `signal-collector` service | A new image, compose service, SPIRE entry, ACLs, K8s manifests and release matrix entry for a validation MVP; financial-scraper already has the collector / HTTP split, MySQL and node-cron |
| A time-series database for market signals and MongoDB for the rest | Two more stores to run, back up and secure for a few thousand rows a day; MySQL is backed up with PITR already; `SignalStorePort` keeps the choice open |
| Signals in MongoDB | financial-scraper has no MongoDB access: a new database, user, egress rule and backup classification, for flat documents |
| Drop stale or low-confidence signals at ingestion | The consumers must learn to weigh them (first requirement of the note) |
| Copy sector data onto each asset of the sector | One copy of the same weather row per agricultural asset; the sector is a subject instead |
| Publish signals on message-manager now | No consumer; the bus is Phase 2 of the note |
| Reddit or RSS as the social test source | Reddit requires a registered OAuth app; RSS needs an XML parser; Mastodon's public JSON API needs neither |

## Consequences

### Positive

- Four sources of four dimensions share one worker, one scheduler, one store and one API: a fifth source is a registry entry, plus an adapter for a new format.
- Every row carries a point-in-time `observedAt` and a confidence: features built later can use them without collecting again.
- A source that changes its format shows up in `fs_signal_collections_total{result="invalid_payload"}` and the logs instead of being stored wrong.

### Negative

- Deferred to the production phase of the note: retry with backoff, circuit breaker and quarantine per source, adaptive rate limiting, caching, DLQ routing of invalid payloads, per-dimension staleness alerts, a reliability dashboard. No alert reads `fs_signal_collections_total` yet: a failing source fails at each tick, logged and counted.
- `reliabilityScore` is a static prior, not a gate; no retention policy (market signals add about 1 100 rows a day).
- Nothing consumes the signals: injecting confidence and age as features, and Sector Managers, wait for an agent architecture that does not exist yet.
- SEC EDGAR answers 403 until `SIGNAL_USER_AGENT` holds a contact. The free Open-Meteo API is for non-commercial use, mastodon.social and SEC EDGAR have rate limits: the terms of each source must be checked before production use.
- The registry is bundled: a new source needs a release. It names `data-api.binance.vision`, which `BINANCE_BASE_URL` (ADR-0026 fallback) does not switch.
- Values are numbers: text (posts, filing text) needs schema v2 with an enrichment step.
- No per-source secret exists: none of the test sources has a key. The first keyed source adds one, separate per source.
