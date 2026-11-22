# ADR-0078: The Trainer's Features Come From the Candle Window Alone

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0022](./0022-versioned-model-artifacts.md) (model artifacts), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point in time), [ADR-0044](./0044-singleton-trainer.md) (candle window read from MySQL), [ADR-0066](./0066-simulated-fills-at-next-bar-open-with-execution-costs.md) (fills and costs)
**Verified by:** `services/trader-trainer/tests/unit/domain/point-in-time.spec.ts`, `packages/model-runtime/tests/forward-and-codec.spec.ts`, `bun run api:check`

## Context

Since issue #1209 each session replaces the candles of a symbol with the window stored in MySQL, but trades, order books, book tickers, 24h tickers and prices still came from the bus and lived in the pod's memory. Every candle older than the pod had empty microstructure features, the recent ones had them, and the test segment alone was fully filled. Each restart or Lease handover (ADR-0058) put about 8 h (500 candles) of training on incomplete inputs, and two pods started at different times built different `MarketStep`s for the same instant (issue #1252, audit M1/m1). The scraper has no read route for order books or book tickers.

## Decision

Owner's choice, option 1 on issue #1252.

1. **18 inputs.** The feature vector keeps the 9 candle fields, the 8 sliding closes and the bias (`FEATURE_DIM` 18; the network input is 19 with the agent exposure). The 14 order book, book ticker, trade, 24h ticker and price fields are removed, with their builders, handlers and the `isAfterLast` loss of out-of-order messages.
2. **No subscription.** The trainer subscribes to no bus topic and mounts no `POST /message` callback: the candle topic was a notification only. Its candles come from the scraper.
3. **Old models are not served.** `FEATURE_LAYOUT` is the layout key: a stored manifest whose `features` differ from `NETWORK_INPUT_LAYOUT` is skipped at rehydration (logged) and the symbol is retrained; its weights cannot run on the new input size.

## Consequences

- Two pods give the same `MarketStep`s for the same symbol and window, by construction.
- The microstructure signal is lost; a model that needs it must read stored history (a route for order books first) in a new ADR.
- Published 32-input models stay readable as files but are no longer served as the best agent; model-evaluator keeps the layout it is sent.
- financial-scraper no longer publishes the market topics: stopped in #1764 (`ddb41f301`), with no subscriber left; the `MarketEvent` contract was removed in #1797 (`964142d3b`).
- ADR-0030's point-in-time rule stays for the candle statistics; ADR-0044's "still starts empty" limit is gone.
