# ADR-0083: Registry Assets Train on Daily Bars Rebuilt from Market Signals

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0036](./0036-multi-dimension-signals-mvp.md) (signals), [ADR-0039](./0039-configuration-feature-flags.md) (defaults keep today's behaviour), [ADR-0066](./0066-simulated-fills-at-next-bar-open-with-execution-costs.md) (execution costs), [ADR-0069](./0069-model-admission-verdict-on-the-test-segment.md) (admission), [ADR-0080](./0080-daily-prices-from-twelve-data-free-tier.md) (daily prices)
**Verified by:** `packages/http/tests/unit/signals/signal-bar-history.spec.ts`, `services/trader-trainer/tests/unit/adapters/inbound/scheduler/training-loop.spec.ts`, `bun run config:check`

## Context

The trainer only knew crypto symbols on one-minute candles. Equities and ETFs of the registry have daily prices in `signals` (ADR-0080) and no candles.

## Decision

1. **Second bar source.** `SignalBarHistory` implements `CandleHistoryPort` over the asset's own `market` signals: `open`, `high`, `low`, `close`, `volume` sharing a `period` give one `1d` bar. A day missing a metric is dropped and counted (`tt_daily_bar_issues_total{issue="incomplete_day"}`). Only signals observed at or before the session instant are read (ADR-0030).
2. **Configuration.** `TRAINER_ASSETS` (`ASSET:type` pairs, empty by default) adds these assets to the symbols; the asset id is the model `symbol`. `TRAINER_SYMBOLS` and its one-minute path are unchanged: with `TRAINER_ASSETS` empty the code path, the seeds and the published genome are those of before.
3. **Cadence follows the series.** Bars per year are measured from the data (the mean gap when the median gap is a day or more, so weekends and holidays count: about 260, not 365; a dropped day widens the mean gap and lowers the count, as the bars are then really further apart); a daily bar is fresh for 4 days (a Friday close is current on Tuesday after a Monday holiday); a daily symbol is not retrained before its next bar. `TRAINER_DATA_WINDOW` counts bars: 500 daily bars are two years.
4. **Costs by asset type.** Fee and half-spread plus slippage per type (`DEFAULT_ASSET_COSTS`, override `TRAINER_ASSET_COSTS`); crypto keeps `SIMULATOR_PARAMS`. Fills stay at the next bar's open (ADR-0066). The manifest `replay` block carries the costs and `intervalMs` (optional values; `formatVersion` and the bus event do not change).
5. **Features.** The inputs stay candle-only (ADR-0078): no book, trade or ticker input exists for any symbol, so none is fed; the manifest `features.fields` lists the inputs (a test pins it).
6. **Adjusted prices.** A day's `adjusted_close`, when the source gives one, scales that day's prices. Otherwise a close-to-open jump beyond a factor 1.8 is counted (`issue="split_suspect"`) and logged, never corrected.

## Consequences

- No dividends, no splits beyond what the source adjusts, no intraday hours, no short selling, no multi-asset portfolio.
- The cadence memory is in process: a restart retrains once.
- The cost values are assumptions for liquid listed products, not measurements.
