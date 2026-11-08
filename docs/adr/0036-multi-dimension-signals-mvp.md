# ADR-0036: Multi-Dimension Signals MVP — Frozen Schema, Static Source Registry of Free Sources, Generic `rest_api` Worker

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0026](./0026-binance-public-market-data-kept.md) (Binance public data, source port), [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (API schemas), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) (reachability gate), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point-in-time data)
**Verified by:** `services/financial-scraper/tests/unit/signals/signal-registry.spec.ts`, `packages/http/tests/unit/adapters/inbound/acl-config.spec.ts`, `tests/e2e/gateway.e2e.spec.ts`, `services/financial-scraper/tests/unit/signals/source-adapters.spec.ts`, `services/financial-scraper/tests/unit/signals/signal-collector.spec.ts`, `services/financial-scraper/tests/unit/clients/http/api-routes.spec.ts`, `services/financial-scraper/tests/db/market-data.db.spec.ts`

## Context

The platform collects one dimension from one source: Binance market data (ADR-0026), in Binance's shape, consumed per symbol by the trainer. A design note asks to widen collection to every kind of data that moves an asset: `market`, `fundamental`, `macro`, real estate, `contextual` (weather, agriculture, news), `social`, `legal`, from free sources only. Its MVP is meant to validate the abstraction, not to cover sources:

1. a frozen, versioned `Asset` / `Dimension` / `Source` / `Signal` schema;
2. a static source registry (JSON or YAML, no admin UI);
3. one worker per protocol, `rest_api` first, with four test sources, one per dimension (`market`, `fundamental`, `contextual`, `social`; the note's examples: Binance, SEC EDGAR, Open-Meteo, RSS or Reddit);
4. a simple scheduler (a cron is enough);
5. a normalizer with one adapter per test source;
6. basic storage ("a TSDB for market data, a document store for the rest", no graph store);
7. a serving API: the signals of an `asset_id`, every dimension, over a time window.

Success criterion: a fifth source, of any dimension, needs a registry entry and an adapter, and no change to the scheduler, the bus or the store.

Two requirements of the note concern the consumers and shape the schema:

- `confidence_score` and freshness (`observed_at`) are features in their own right, not upstream filters: an Analyst must learn to weigh a 3-month-old fundamental differently from a 3-second-old price.
- Sector-wide `contextual` data (weather: every agricultural asset, not only wheat) belongs to Sector Managers, rather than being duplicated for each Asset Analyst.

The project owner then asked that every source be free for any use: no "non-commercial" or "research only" terms. Terms checked on 2026-11-04:

| Source | Terms | Free for any use? |
| --- | --- | --- |
| Open-Meteo free API | "only for non-commercial purposes" (data CC BY 4.0, service restricted) | No |
| Binance, `data-api.binance.vision` | Binance Vision Dataset Terms v1.0 (2026-08-26): CC BY-NC-SA 4.0, "commercial licensing is strictly excluded", no "live proprietary trading execution" (§4.2) | No |
| Mastodon (`mastodon.social`) | No licence found for API data | Not shown |
| GDELT DOC API | Unrestricted use with citation, but answers 429 ("one every 5 seconds") to a single request | Yes, unusable |
| SEC EDGAR | sec.gov: "may be copied or further distributed ... without the SEC's permission", cite the SEC | Yes |
| ECB Data Portal | ECB statistics: free reuse "irrespective of any subsequent commercial or non-commercial use", source quoted, unmodified | Yes |
| US National Weather Service (`api.weather.gov`) | Public domain, "without charge for any lawful purpose" | Yes |
| Wikimedia Analytics API (page views) | CC0 1.0 | Yes |

Also checked: no exchange publishes crypto or equity prices under such terms; ECB, SEC, NWS and Wikimedia answer 200 without key. SEC EDGAR answers 403 ("Undeclared Automated Tool") to a User-Agent without a contact e-mail (fair access policy, at most 10 requests/s); NWS and Wikimedia require a User-Agent and accept a contact URL in it. The platform has MySQL (market data, backed up daily with hourly PITR archives) and MongoDB (audit, DLQ), no time-series database; financial-scraper only talks to MySQL and already splits HTTP replicas from a single collector pod. No Analyst or Sector Manager exists: the trainer is a GA + DQN per symbol, fed by market data only.

## Decision

1. **Schema v1, the model of the note's §1** (`services/financial-scraper/src/domain/signals.ts`, Zod, `SIGNAL_SCHEMA_VERSION = 1`). A change that breaks a reader of the registry or of stored or served signals bumps the version.
   - `Dimension` (§1.2): `market`, `fundamental`, `social`, `contextual`, `legal`, `macro`. Real estate is an asset type, not a dimension.
   - `Asset` (§1.1): `id`, `name`, `assetType` (`crypto`, `equity`, `bond`, `real_estate`, `etf`, `commodity_proxy`: a commodity through an ETF or ETC), a polymorphic `identifier` (`ticker` with an optional exchange MIC, `isin`, `contract` chain and address, `insee` commune code, `series` for a benchmark without a security of its own), each asset type allowing only its schemes, `applicableDimensions` (a government bond has no social data: signals of other dimensions are neither collected nor served for the asset) and `sector`.
   - `Source` (§1.3): `id`, `protocol` (`rest_api` only: a protocol such as `html_scrape`, `rss`, `websocket` or `file_feed` enters the enum with its worker), `covers` (the (asset type, dimension) pairs it can feed), `accessPolicy` (terms, `auth`, `maxRequestsPerMinute`), `reliabilityScore` (0–1), plus `adapter`, `schedule` (cron) and `requests` (subject, `dimension`, HTTPS URL, adapter `params`).
   - `Signal` (§1.4): `id`, `schemaVersion`, `sourceId`, `dimension`, `assetId` or `sector` (exactly one), `observedAt`, `ingestedAt`, `confidenceScore`, `payload`.
   - `payload` is the canonical payload of the dimension (`PAYLOADS`): a measure (`metric`, numeric `value`, `unit`, optional source `details`) plus what reads it in its dimension: `market` an optional `period` (the day of a daily value); `fundamental` the `period` covered and the `filing` (form, id, fiscal year and period); `social` the `platform`, the `topic` counted and the `period`; `contextual` the `location` measured; `legal` the `jurisdiction`; `macro` the `area` and the `period`. Periods are inclusive ISO dates.
   - Fields are camelCase on the wire, like the rest of the API (`observed_at` becomes `observedAt`, `ingested_at` `ingestedAt`, `confidence_score` `confidenceScore`, `asset_type` `assetType`); MySQL columns are snake_case.
   - Registry checks on top of the schema: a request's dimension is covered by its source for the asset type of its subject, applies to that asset (one asset of the sector for a sector subject), and is a dimension whose payload the adapter writes; the protocol has a worker.
2. **Only sources free for any use.** `accessPolicy.terms` is `public-domain` or `attribution` (then `attribution` holds the credit to give), with the `termsUrl` read when the source was added. Other terms cannot be written, so a non-commercial or research-only source cannot enter the registry. `auth` is `none` only (no per-source secret yet); the collector waits `60 / maxRequestsPerMinute` s between two requests of a source.
3. **Confidence and freshness are stored and served, never filtered on.** `confidenceScore` is the source's `reliabilityScore` at collection time, a prior: ECB and SEC EDGAR 0.95, NWS 0.8, Wikipedia page views 0.3 (social data is low-confidence by default). `observedAt` is point-in-time, never earlier than the value was public:
   - the source's own time when it gives one that is safe: an EDGAR fact at the end of its filing day (US Eastern, 05:00 UTC the next day), not at the end of its period;
   - otherwise the first collection that saw the value: the ECB, NWS and Wikimedia publish no release time, and the store keeps that first row (decision 9). An NWS observation time is when the station measured, before NWS publishes the value: it stays in the payload (`details.measuredAt`).
   A consumer computes the age as now minus `observedAt`; the period a value refers to is in the payload (`period`).
4. **A request is about an asset or a whole sector.** A sector signal is stored once (`sector` set, `asset_id` null) and served with the signals of every asset of the sector: the weather of the US wheat belt is an `agriculture` signal, not a `WHEAT` one.
5. **Static registry** `services/financial-scraper/src/config/signal-registry.json`, bundled in the image and parsed at startup by `parseSignalRegistry` (`src/config/signal-registry.ts`): the schema, then unique ids, known subjects and adapters, valid cron expressions, adapter `params`, URL placeholders. Every problem is reported at once and a broken registry stops the service.
6. **One worker per protocol.** Only `rest_api` exists (`src/adapters/outbound/signal-sources/rest-api.worker.ts`): GET, JSON body, 10 s timeout, no retry (the next tick of the source is the retry). The schema refuses a protocol without a worker. A URL may hold `{date-N}`, the UTC date N days before the collection as YYYYMMDD, for APIs that take a date range.
7. **Normalizer: one adapter per source format** (`SOURCE_ADAPTERS`). An adapter validates its payload with Zod and returns observations; the collector (`src/application/signal-collector.ts`) completes them into signals and checks each against the schema. A payload that does not match, or a body that is not JSON, is logged and counted `invalid_payload` in `fs_signal_collections_total{source,result}`: never stored half-parsed, never dropped silently.
8. **Scheduler: one node-cron task per source**, on its own schedule (`src/adapters/inbound/cron/signal.cron.ts`): a slow or failing source never delays another, an overlapping tick is skipped, requests of a source run one after the other. It runs where the scrape cron runs (`SCRAPE_SCHEDULER_ENABLED`: the collector pod) and only if `SIGNAL_COLLECTION_ENABLED` (default `true`). CI turns it off (E2E overlay, `tests/k8s/ci-render.mjs`, which fails if it is not off): the test sources are real public APIs.
9. **One MySQL table, `signals`** (migration 006, database `financial_scraper`), for every dimension: the envelope in columns, the canonical `payload` in a JSON column. `id` is the sha256 of source, subject, metric and the observation's key; inserts use `ON DUPLICATE KEY UPDATE id = id`, so a replayed collection stores nothing twice and the first row stays. A CHECK constraint enforces one subject per row. The candle, trade and ticker tables stay the high-frequency market store.
10. **Serving API** `GET /signals/assets/:assetId?from=&to=` (public: `GET /v2/financial-scraper/signals/assets/:assetId`): the registry asset, then its own and its sector's signals of its applicable dimensions observed in `[from, to)`, oldest first, at most 5000 per answer (`truncated: true` beyond: narrow the window). Unknown asset: 404.
11. **No publication on the message bus** in the MVP: nothing consumes signals yet.
12. **Test sources** (one per dimension of the MVP):

    | Source | Dimension | Subject | Schedule | Terms |
    | --- | --- | --- | --- | --- |
    | ECB Data Portal, euro area AAA government bond yield curve, 10-year spot rate | `market` | `EA_AAA_10Y` (bond, `series` identifier) | daily 15:07 UTC, weekdays (after the ECB release) | attribution: "Source: ECB statistics" |
    | SEC EDGAR companyconcept, Apple `us-gaap:EarningsPerShareDiluted` | `fundamental` | `AAPL` (equity, ISIN) | daily | attribution: SEC |
    | NWS latest observation of Hutchinson, Kansas (KHUT): temperature, humidity, precipitation | `contextual` | sector `agriculture` (`WHEAT`: commodity proxy WEAT on NYSE Arca) | hourly (stations report once an hour) | public domain |
    | Wikipedia page views of the "Bitcoin" and "Ethereum" articles | `social` | `BTC`, `ETH` (crypto, ticker) | daily | public domain (CC0) |

13. **Contact e-mail outside the repository.** Every request sends the User-Agent `automated news analysis <SIGNAL_CONTACT_EMAIL>`, the form SEC EDGAR's fair access policy asks for (without e-mail: the repository URL, which NWS and Wikimedia accept). The repository and its CI logs are public, so the e-mail is never committed: compose reads it from `.env`; K8s from the `signal-contact` ConfigMap (optional key of the collector), written by `deploy.yml` from the GitHub environment secret `SIGNAL_CONTACT_EMAIL`.
14. **The data supply serves everything; the trainer picks its inputs.** The next phase changes the trainer only:
    - The trainer reads the data supply directly over mTLS: the `financial-scraper` ACL (`DEFAULT_ACL`, `@trading-model/http`) admits `trader-trainer`, and the K8s NetworkPolicies already let it reach port 3000.
    - Signals are pulled by training window with `GET /signals/assets/:assetId?from=&to=` (split the window when `truncated`). Candles keep arriving on the bus.
    - The trainer maps its symbols to registry assets (`BTCUSDT` → `BTC`) and chooses the dimensions and metrics it uses. The collector stores and serves every source, whatever the trainer reads.
    - The `Signal` schema moves to `@trading-model/validation/wire` (ADR-0021 convention) when the trainer parses it: an import move in the scraper, nothing it collects or serves.

Adding a source of a known format is an entry in `signal-registry.json` with its `accessPolicy`, after reading its terms. A new format also needs an adapter in `src/adapters/outbound/signal-sources/` and its line in `SOURCE_ADAPTERS`. The scheduler, the store and the API do not change.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| A new `signal-collector` service | A new image, compose service, SPIRE entry, ACLs, K8s manifests and release matrix entry for a validation MVP; financial-scraper already has the collector / HTTP split, MySQL and node-cron |
| A time-series database for market signals and MongoDB for the rest | Two more stores to run, back up and secure for a few thousand rows a day; MySQL is backed up with PITR already; `SignalStorePort` keeps the choice open |
| Signals in MongoDB | financial-scraper has no MongoDB access: a new database, user, egress rule and backup classification, for flat documents |
| Binance 24 h ticker as the market test source (the note's example) | `data-api.binance.vision` is under CC BY-NC-SA 4.0 and forbids live proprietary trading; no exchange offers prices free for any use. The ECB yield is free for any use and adds a second asset class |
| Open-Meteo (contextual), Mastodon or Reddit or RSS (social) | Open-Meteo's free API is non-commercial; no licence found for Mastodon API data; Reddit requires a registered OAuth app; RSS needs an XML parser |
| GDELT (social: mentions and tone) | Free for any use, but answered 429 to a single request |
| A source's period end or day end as `observedAt` when it gives no release time | Earlier than the value was public: training on it would leak the future |
| Drop stale or low-confidence signals at ingestion | The consumers must learn to weigh them (first requirement of the note) |
| Copy sector data onto each asset of the sector | One copy of the same weather row per agricultural asset; the sector is a subject instead |
| Publish signals on message-manager now | No consumer; the bus is Phase 2 of the note |

## Consequences

### Positive

- Four sources of four dimensions and three asset classes share one worker, one scheduler, one store and one API: a fifth source is a registry entry, plus an adapter for a new format.
- Every source in the registry may be used for anything, trading included; the schema refuses the others.
- Every row carries a point-in-time `observedAt` and a confidence: features built later can use them without collecting again.
- A source that changes its format shows up in `fs_signal_collections_total{result="invalid_payload"}` and the logs instead of being stored wrong.

### Negative

- Deferred to the production phase of the note: retry with backoff, circuit breaker and quarantine per source, adaptive rate limiting, caching, DLQ routing of invalid payloads, per-dimension staleness alerts, a reliability dashboard. No alert reads `fs_signal_collections_total` yet: a failing source fails at each tick, logged and counted.
- `reliabilityScore` is a static prior, not a gate; no retention policy.
- Nothing consumes the signals: injecting confidence and age as features, and Sector Managers, wait for an agent architecture that does not exist yet.
- No crypto or equity price among the signals: no source of them is free for any use. The candles of the Binance pipeline (ADR-0026) remain the market data of the trainer, under Binance's terms.
- "First collected" times depend on the schedule: the first collection after a deployment stamps the whole returned window (8 days of page views, 5 ECB periods) with its own time.
- SEC EDGAR answers 403 where `SIGNAL_CONTACT_EMAIL` is unset (each environment needs the GitHub secret). The `attribution` sources must be credited wherever their data is published: the signals API does not carry the credit, its clients being internal (trainer, admin dashboard behind the gateway); a client that publishes outside gives the registry's `attribution` text.
- The canonical payloads were designed with the MVP sources (the note leaves them open): `legal` and `macro` have none yet, so their payloads are a first guess, to confirm with their first source before production.
- Periods are dates: an intraday period (rain over the last hour) stays in the metric name.
- The registry is bundled: a new source needs a release.
- Values are numbers: text (posts, filing text) needs schema v2 with an enrichment step.
- No per-source secret exists: none of the test sources has a key. The first keyed source adds one, separate per source.
