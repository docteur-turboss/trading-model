# ADR-0064: Simulated Fills at the Next Bar Open With Half-Spread and Slippage Costs

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0025](./0025-ga-fitness-wired-to-fitness-type.md) (item 16: what a trade pays), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (criteria read after these costs)
**Verified by:** `services/trader-trainer/tests/unit/env/wallet-manager.spec.ts`, `services/trader-trainer/tests/unit/core/market-data-buffer.spec.ts`, `services/trader-trainer/tests/unit/agent/trading-agent.spec.ts`, `services/trader-trainer/tests/unit/core/point-in-time.spec.ts`

## Context

The trainer's simulator was optimistic (audit risque trading 2026-11-11, C2, issue #883):

- the decision of a bar read the features known at its close and was filled **at that same close**: the order could only leave after the close, at a price the decision never saw;
- a trade paid the 0.1 % taker fee only: no spread, no slippage. Each trade moves 10 % of the initial cash (ADR-0025 item 16), so every round trip of the learned policy hid these costs.

The order book features exist, but no order book history covers the MT4 runs (ADR-0030, ADR-0053): a measured spread cannot be the cost.

## Decision

1. **Next-open fill.** `MarketStep.fillPrice` is the open of the next candle (`WindowSplitter.buildMarketSteps`). The decision of bar t is still taken on what its close knew and marked at its close (`price`); the trade fills at `fillPrice`. The trade is sized on the close, the only price known at decision time. Features are unchanged: they read nothing after the close of t (`point-in-time.spec.ts`).
2. **Last bar of a series:** no next candle, so its decision fills at its own close. One decision per series (the newest candle of the live buffer, the last test candle of an MT4 segment), with the costs below.
3. **Execution cost:** a buy pays `fillPrice × (1 + c)`, a sale receives `fillPrice × (1 − c)`, then the 0.1 % fee applies on that amount (`WalletConfig.executionCostRate`, `TradeCostParams`). `c` = half-spread + slippage.
4. **Default `c` = 5 bps** (`EXECUTION_COST_RATE`, `rl-backend.ts`), not an environment variable. Justification: the trainer trades liquid Binance spot pairs (BTCUSDT, ETHUSDT), whose quoted spread is a fraction of a basis point; 5 bps covers that half-spread plus the slippage of a market order of a retail size and leaves a margin for less liquid symbols. A round trip now costs about 0.3 % (2 × (0.1 % + 0.05 %)) instead of 0.2 %. Same code for the live trainer and `scripts/mt4-walk-forward.ts`.
5. **`metricsVersion` 4** (`model-artifact.ts`): metrics of models published before are not comparable.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep the fill at the close, add the cost only | The decision would still read the price it is executed at |
| Spread measured on the order book | No order book history for the MT4 runs; possible later for live training |
| Last bar: no execution | Needs a "decide but do not trade" path in the agent for one decision per series; filling at the close with costs keeps one code path |
| Cost as an environment variable | Nobody needs to tune it per deployment yet; a constant keeps the metrics of every deployment comparable |
| Volume-dependent market impact | Out of scope (issue #883): orders are 10 % of 1,000 of cash |

## Consequences

- Backtest PnL drops by the costs of every trade; agents that trade often are penalised, which is the point.
- The reward of a decision now includes the gap between the close of t and the open of t+1 on the units traded (small on 24/7 crypto markets).
- 5 bps is a judgement, not a measurement; revisit when order book history allows measuring the spread.

## Results

See ADR-0030 Results, run of 2026-11-11.
