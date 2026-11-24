# ADR-0080: Daily Equity and ETF Prices from the Twelve Data Free Tier, as `market` Signals

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0036](./0036-multi-dimension-signals-mvp.md) (decisions 3, 9), [ADR-0075](./0075-non-commercial-signal-sources-admitted-and-tagged.md) (rank 2), issue #1272
**Verified by:** `services/financial-scraper/tests/unit/adapters/outbound/signal-sources/source-adapters.spec.ts`, `services/financial-scraper/tests/unit/config/signal-registry.spec.ts`

## Context

No equity or ETF price is collected: ADR-0036 found no source free for any use. ADR-0075 admits rank 2 (personal or research use) only when no rank 1 source gives the same data. Terms read on 2026-11-16; the owner's reading of 2026-11-16 excluded Tiingo (free plan: no persistent storage, no model training):

| Source | Terms read | Free quota | Coverage | Adjusted close | Rank |
| --- | --- | --- | --- | --- | --- |
| Stooq | No terms found; a JavaScript proof-of-work page answers any non-browser client | n/a | US, Europe | no | inadmissible |
| Alpha Vantage ([terms](https://www.alphavantage.co/terms_of_service/)) | "for personal, non-commercial use, unless you and Alpha Vantage have agreed otherwise in writing" | 25 requests a day | US + some | premium only | 2, quota too small |
| Twelve Data ([terms](https://twelvedata.com/terms)) | §2.2(a) store Data "solely for Internal Use"; §2.2(c) "Create Derived Data that cannot be reverse-engineered"; §6.2 "Customer retains rights to Derived Data"; §2.3(l) no "Use Free Tier data for commercial purposes" | 800 requests a day, 8 a minute | Basic plan: US only (Europe from the Pro plan) | split-adjusted `close` only | 2 |
| Finnhub ([terms](https://finnhub.io/terms-of-service)) | "strictly for personal use unless explicitly stated otherwise" | 60 requests a minute | US | no | 2 |
| Tiingo (terms page unreadable: 403) | Free plan: no persistent storage, no training (owner's reading) | 1000 requests a day | US | yes | excluded |

Marketstack was dropped: its terms redirect to a page of links, nothing to read. No source reaches rank 1. Twelve Data is the only rank 2 source that gives the quota, stores for internal use and keeps the rights on derived data (model weights).

## Decision

1. Collect with Twelve Data (`twelvedata-daily-prices`): `terms: non-commercial`, `commercialLicence: available`, key `SIGNAL_KEY_TWELVEDATA` in the query parameter `apikey`, 1 request per asset and day against 800.
2. Signals of dimension `market`, in `signals`, not in `market_candles`: metrics `open`, `high`, `low`, `close`, `volume`; `period` = observation key = session day. The API's `close` is split-adjusted; no `adjusted_close` (no separate field).
3. Daily collection: `observedAt` left out, the API gives no release time, so the collection time stands (ADR-0036 decision 3). The schedule (01:30 UTC, Tuesday to Saturday) runs after the US close.
4. History (issue #1483, owner decision 2026-11-24, restores `signal-backfill` removed by #2345): the registry entry `history` (`outputsize=500`, `start_date`/`end_date`, `pageDays` 700: one request per asset for about 500 bars, within 8 a minute and 800 a day, shared with the daily collection). A backfill dates each bar at 21:00 UTC of its session day, after the US close all year, so the point-in-time read (ADR-0083) never sees a bar before its session ended. The first collection of a day later keeps the stored row (same id).

## Consequences

- Open clause: §2.3(g) forbids storing Data "beyond permitted timeframes specified in the Documentation"; the documentation fixes none (owner read the home page, the pricing page and `pricing.md`, 2026-11-16). Re-read when the plan changes.
- Open risk: the terms say nothing for or against model training; the weights are derived data (§2.2(c), §6.2), kept internal. §2.3(f) forbids derivative financial products without written agreement: the model must stay internal.
- §16.2(a): after termination, "All Data must be deleted within 30 days": this covers `signals` rows of this source and the backups. Procedure at termination: purge `source = 'twelvedata-daily-prices'` and expire the backups holding it.
- Coverage is US only: UCITS ETFs and European equities stay uncovered (Pro plan, 229 $ a month).
- The collection runs only where the key is set; `fs_signal_sources` and the startup log list the source as `non-commercial`. Commercial use needs the Twelve Data commercial licence first.
- Twelve Data receives the key, the collector IP and the functional User-Agent address: added to the data processing register and the third-party table.
