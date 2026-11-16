# ADR-0078: Daily Equity and ETF Prices from the Tiingo Free Tier, as `market` Signals

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0036](./0036-multi-dimension-signals-mvp.md) (decisions 3, 9), [ADR-0075](./0075-non-commercial-signal-sources-admitted-and-tagged.md) (rank 2), issue #1272
**Verified by:** `services/financial-scraper/tests/unit/signals/source-adapters.spec.ts`, `services/financial-scraper/tests/unit/signals/signal-registry.spec.ts`

## Context

No equity or ETF price is collected: ADR-0036 found no source free for any use. ADR-0075 admits rank 2 (personal or research use) only when no rank 1 source gives the same data. Terms read on 2026-11-16:

| Source | Terms read | Free quota | Coverage | Adjusted close | Rank |
| --- | --- | --- | --- | --- | --- |
| Stooq | No terms found; a JavaScript proof-of-work page answers any non-browser client (CSV download blocked) | n/a | US, Europe | no | inadmissible |
| Alpha Vantage ([terms](https://www.alphavantage.co/terms_of_service/)) | "for personal, non-commercial use, unless you and Alpha Vantage have agreed otherwise in writing" | 25 requests a day | US + some | premium only | 2 |
| Twelve Data ([terms](https://twelvedata.com/terms)) | §2.3(l): no "Use Free Tier data for commercial purposes" | 800 requests a day, 8 a minute | US, partial Europe | yes | 2 |
| Finnhub ([terms](https://finnhub.io/terms-of-service)) | "strictly for personal use unless explicitly stated otherwise"; no redistribution of derived results | 60 requests a minute | US | no | 2 |
| Tiingo ([pricing](https://www.tiingo.com/about/pricing)) | Free tier licence "Internal Use Only": "you may only use the data for your own personal use" | 1000 requests a day, 50 an hour, 500 symbols a month | US equities and ETFs | `adjClose` (splits and dividends) | 2 |
| Marketstack | Terms not read | | | | not retained |

No source reaches rank 1. Of the rank 2 sources, Tiingo gives the largest daily quota and the adjusted close at no cost, and sells a commercial licence.

## Decision

1. Collect with Tiingo (`tiingo-daily-prices`): `terms: non-commercial`, `commercialLicence: available`, key `SIGNAL_KEY_TIINGO` in the query parameter `token`, 1 request per asset and day against 1000 (the registry check of `maxRequestsPerDay` guards it).
2. Signals of dimension `market`, in `signals`, not in `market_candles`: metrics `open`, `high`, `low`, `close`, `adjusted_close`, `volume`; `period` = session day; observation key = session day.
3. `observedAt` = 17:30 New York time of the session day, when Tiingo says US prices are available (corrections follow until 20:00; the stored first value stays). Never before the close.
4. One template per asset type (`equity`, `etf`, `commodity_proxy`) on the alias `tiingo` of the asset. No `startDate`: the answer holds the last session, so a day missed by the collector is a gap for the history catch-up issue.

## Consequences

- The collection runs only where the key is set; the `fs_signal_sources` gauge and the startup log list the source as `non-commercial`. Commercial use needs the Tiingo commercial licence first.
- Coverage is US-listed only: UCITS ETFs and European equities stay uncovered.
- The data processing register is unchanged: Tiingo receives the key and the collector IP only.
