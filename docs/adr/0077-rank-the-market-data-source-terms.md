# ADR-0077: Rank the Market Data Source Terms Against the Licence Order, Add Bitstamp as Second Source

**Status:** Proposed
**Date:** 2026-11
**Related:** [ADR-0026](./0026-binance-public-market-data-kept.md) (amended: Decision 4 fallbacks re-ranked), [ADR-0036](./0036-multi-dimension-signals-mvp.md) (Binance Vision terms), [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) (expand/contract), issues #1291, #1264
**Verified by:** `bun run adr:check`

Documentation only. Nothing here changes code, configuration or a manifest. Owner decision (2026-11-15, issue #1291): option 1, double with Bitstamp. The ADR stays `Proposed` until Binance gives written confirmation and the Bitstamp agreement is signed.

## Context

The trainer's candles, trades, tickers and order books come from `api.binance.com` (ADR-0026). The project licence rule (#1264) ranks sources: **rank 1** free for commercial use; **rank 2** free for personal or research use only, with the status of a commercial licence stated; otherwise **inadmissible**. The market source was never ranked. ADR-0036 only noted that the Binance Vision dataset terms exclude commercial use and live trading.

## What could and could not be read (2026-11-15)

Primary texts were fetched on 2026-11-15. A page that could not be read is marked so: no clause is quoted from memory.

| Source | Terms (URL) | Clause | Data offered | Limits | Rank |
| --- | --- | --- | --- | --- | --- |
| Binance `api.binance.com` | `https://www.binance.com/en/terms` | **Not readable**: the page is rendered by script and returned only its footer. The only public statement found is a forum thread (`dev.binance.vision/t/public-rest-api-for-commercial-use-case/23067`, 2024-11): no Binance reply, a community member's opinion that account terms "do not really apply" to keyless public endpoints | 1 m candles (`klines`), trades, 24 h tickers, depth | Weight-based, 429 then 418 ban (ADR-0026) | **Rank 2, provisional** (owner's reading, 2026-11-15): free public access, personal and non-commercial research compatible with the general licence; free commercial use not established; no `api.binance.com`-specific commercial licence found; no explicit ban on commercial use of its raw data found. Conservative ranking, not a legal conclusion |
| Binance `data-api.binance.vision` | `https://data.binance.vision/Binance_Vision-Terms_of_Use.pdf` (v1.0, 2026-08-26) | CC BY-NC-SA 4.0, "Commercial licensing is strictly excluded"; §4.2 forbids "live proprietary trading execution" (ADR-0036) | Same endpoints | Same | **Inadmissible** for trading |
| Bitstamp | `https://www.bitstamp.net/api/` | "Bitstamp allows the incorporation and redistribution of our exchange data for commercial purposes", on request: contact `partners@bitstamp.net` and sign a "commercial use Data License Agreement" | OHLC (`step` in seconds), order book, trades (minute, hour, day) | 400 requests/s, 10 000 per 10 min by default | **Rank 2, commercial licence available** (to be signed) |
| Kraken | `https://docs.kraken.com/api/docs/rest-api/get-ohlc-data` | No terms on the page; the legal page `kraken.com/legal/api-terms` answered 404 | OHLC 1 m to 15 d, depth, trades | OHLC: "up to 720 of the most recent entries", no older data | **Unclassified** (terms not found) |
| Coinbase Exchange | `https://docs.cdp.coinbase.com/exchange/docs/rate-limits` | "By accessing the Exchange Market Data API, you agree to be bound by the Market Data Terms of Use" (`coinbase.com/legal/market_data`, answered 403, **not read**) | Candles 1 m to 1 d, book, trades | Not read; a third-party source says 10 requests/s per IP (unverified) | **Unclassified** (terms not read) |

## Decision (proposed)

1. **Binance is rank 2, provisional** (owner's reading, 2026-11-15). Not rank 1: no explicit grant of free commercial reuse. Not inadmissible: no clause found that bans commercial use of the raw data of this API. Condition: written confirmation from Binance before the source counts as commercially usable. The owner may still quote the clauses of `binance.com/en/terms` here.
2. **Double, then decide.** Add Bitstamp as a second source (the only candidate with a stated commercial path). Keep Binance for research and training until its terms are read; any live trading stays blocked (algorithmic-trading-compliance §6 item 9).
3. **Replace Binance only if** the owner's reading finds commercial use forbidden. Bitstamp becomes the primary by configuration.
4. The owner signs the Bitstamp Data License Agreement before Bitstamp data feeds a traded model. Kraken and Coinbase are re-ranked once their terms are read (Kraken's 720-candle history also makes backfill slower).
5. ADR-0026 Decision 4 fallback 2 (a MiCA-licensed exchange) is now Bitstamp first, then Kraken.

## Migration path (no breaking change)

| Step | Change | Touches a contract |
| --- | --- | --- |
| 1 | Owner reads the Binance terms, requests the Bitstamp licence | No |
| 2 | Add `Bitstamp` to `SourceType` (`@trading-model/contracts`), **readers first**: release N ships readers (API validation, trainer, evaluator) that accept the value, nothing produces it | Yes: bus schema snapshot (`contracts:write`) and OpenAPI enums; additive (ADR-0061) |
| 3 | Release N+1: `BitstampMarketDataSource` implementing `MarketDataSourcePort`, symbol mapping, rate-limit settings; disabled by default | No (adapter inside financial-scraper) |
| 4 | Enable it beside Binance by configuration, compare candles for a week | No |
| 5 | Switch the trainer's source by configuration; keep Binance as fallback or remove it | No |

## Alternatives Considered

| Alternative | Reason for rejection |
| --- | --- |
| Keep Binance unranked | The rule of #1264 would not apply to the main source |
| Replace Binance now | Its terms are unread: a replacement could be needless work |
| Kraken or Coinbase first | Their terms are unread; Kraken exposes 720 candles only |

## Consequences

- The owner knows the rank is unproven and what to read and sign.
- Cost if accepted: one adapter, one enum value, one agreement.
- Risk: Bitstamp pairs and depth differ from Binance; the trainer's symbols need a mapping.
