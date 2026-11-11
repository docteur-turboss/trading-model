# ADR-0030: Point-in-Time Features and Explicit Success Criteria for the MT4 Walk-Forward Validation

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0025](./0025-ga-fitness-wired-to-fitness-type.md) (fitness, DQN learning, first MT4 run), [ADR-0022](./0022-versioned-model-artifacts.md) (normalisation statistics stored with a model)
**Verified by:** `services/trader-trainer/tests/unit/core/point-in-time.spec.ts`, `services/trader-trainer/tests/unit/core/market-data-buffer.spec.ts`, `services/trader-trainer/tests/unit/core/feature-builder.spec.ts`

## Context

The 2026-09-13 architecture audit put MT4 on the mid-term roadmap: once ingestion is reliable (CT2) and the hyper-parameters are wired (CT3), validate the GA/DQN engine empirically on real historical data, against explicit success criteria (Sharpe, Sortino, drawdown against annualised return, paper trading against backtest gap). Checked on 2026-10-31:

- **No criterion was written down.** The first walk-forward run (ADR-0025, 2026-10-31) concluded "MT4's success criteria are not met" without any threshold. Its script gave Sharpe, Sortino and drawdown per 100-hour segment, but no return / drawdown ratio, no annualised return, one seed per segment, and no chained out-of-sample track record.
- **The features leaked the future.** `MarketDataBuffer` built every step from the symbol state as it was at build time:
  - the order book, book ticker and 24h ticker were the latest received, the same for every past candle (the 24h price change of the last day was visible at the first candle of the window);
  - the price snapshot feature read the latest live price ticker, the price at the end of the window, at every past candle;
  - the trade features took the trades from one minute before the candle open, with no upper bound: every trade received after the candle;
  - every input was normalised with statistics of the whole buffer, so a close was scored against the mean of closes still to come.

  The live trainer trained and validated on these inputs, and the walk-forward script built its test steps from a buffer holding the test candles: the first run's out-of-sample segment was normalised with its own future (it fed candles only, so normalisation was its only leak).
- **The scraper resends trades**: it fetches the latest 100 trades every minute, and the trainer appended them again, counting them twice in the statistics.
- **No paper trading exists**: nothing runs a published model on live data, so the paper trading against backtest gap cannot be measured.

## Decision

1. **Point-in-time features** (`forEachPointInTime`, `src/domain/market-data/point-in-time.ts`). A candle is known at its close; each step reads only what was known then:
   - the latest order book and book ticker received by the close (stamped at reception by the scraper), the latest 24h ticker whose window closed by then (`closeTimestamp`), the latest price ticker received by then (stamped by the trainer at reception), else the close;
   - the trades of the minute ending at the close (`TRADE_LOOKBACK_MS`), by their own time;
   - normalisation statistics rebuilt from that data only, in time order. The statistics kept with the symbol (stored with a model, ADR-0022) are unchanged.

   The symbol state keeps snapshot histories (`orderBooks`, `bookTickers`, `tickers24h`, `prices`, bounded like the candles; order books reduced to one level per side, which keeps the averages and quantities the features read). Snapshots and trades are kept in time order; one that is not newer than the last (same trade id, same timestamp) is dropped and not counted. Consequence: an order book fetched right after a candle closes first shows at the next candle. Models published before this change were trained on leaked inputs; their metrics are not comparable.

2. **Success criteria.** MT4 passes when every criterion holds on the out-of-sample track records, after the 0.1 % taker fee (and, from [ADR-0064](./0064-simulated-fills-at-next-bar-open-with-execution-costs.md), after the next-open fill and 5 bps of half-spread and slippage):

   | Criterion | Threshold |
   | --- | --- |
   | Protocol | at least 2 symbols, 12 chained test segments per symbol, 3 GA seeds per segment |
   | Sharpe ratio, annualised (mean over symbol × seed track records) | ≥ 1.0 |
   | Sortino ratio, annualised (same) | ≥ 1.5 |
   | Calmar ratio: annualised return / maximum drawdown (same) | ≥ 1.0 (the worst fall does not exceed one year of return) |
   | Significance: one-sided t-statistic of the mean segment return (one value per symbol and segment, mean over seeds) | ≥ 2.0 |
   | Stability: share of symbol × seed track records with a positive Sharpe | ≥ 80 % |
   | Beats buy and hold: mean Sharpe above buy and hold's Sharpe on the same bars | on every symbol |
   | Paper trading against backtest, same period and genomes, at least 30 days | return within 25 % of the backtest's and Sharpe within 0.3: **open**, needs a paper-trading runner |

   A track record is a symbol's test segments chained in time order, for one seed: PnL per bar (mean over the evaluation episodes), annualised from the bar spacing; returns and drawdowns are in % of the initial cash, on which trades are sized (ADR-0025 item 16).

3. **Protocol** (`services/trader-trainer/scripts/mt4-walk-forward.ts`): 500 training candles (its own 80 / 20 train / validation split), then 100 test candles never seen by training, segment after segment; the real `TrainingSession`, population 20, 30 generations, 10 evaluation episodes. `seedOffset` (`TrainingSettings`, 0 = the default seeds) makes the seeds independent and reproducible. `--features klines` (default) rebuilds at each close what the candle files allow: the 24h ticker from the previous 24 hours of candles, and the candle's trades as one buyer and one seller aggregate trade from its taker volumes. Binance publishes no order book history: those inputs stay 0. The script prints PASS / FAIL for each criterion.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep the latest snapshot, drop the order book / ticker / price inputs instead | Loses the inputs the scraper collects; the leak in the trades and the statistics stays |
| Freeze the normalisation statistics at the end of the training window only | The training steps would still be scored against their own future |
| Criteria per 100-hour segment | One segment is 4 days: an annualised ratio on it is mostly noise; the chained track record is what a walk-forward measures |
| Judge on mean return only | A long-biased agent follows the market: Sharpe, drawdown and buy and hold tell an edge from exposure |
| Rebuild the trade features from Binance aggregate trades | Millions of trades per month per symbol for a feature that summarises one minute; the taker volumes of the candle give its buy ratio exactly |

## Consequences

- Training and validation no longer see the future. Live training costs one pass over the buffer per build, as before.
- The order book inputs are never exercised by a historical run until the scraper's own history is long enough (it keeps no order book in MySQL, `market_candles` / `market_trades` / `market_tickers` only). *Amended by [ADR-0053](./0053-order-books-persisted-not-served.md): order book snapshots are kept in `market_order_books` from then on.*
- MT4 cannot pass while the paper trading criterion is open.

## Results

Run of 2026-10-31: BTCUSDT and ETHUSDT 1h candles from 2026-08-04 to 2026-10-31, 15 chained test segments per symbol (2026-08-29 → 2026-10-31), 3 seeds, position shown, `--features klines`, point-in-time features. Buy and hold over the same bars: Sharpe −0.21 (BTC) and −1.09 (ETH), mean segment return −0.32 %.

| Fitness | Sharpe | Sortino | Calmar | t (mean segment return) | Sharpe > 0 | Mean segment return |
| --- | --- | --- | --- | --- | --- | --- |
| `total_pnl` | −0.67 | −0.84 | −0.50 | −0.37 | 3 / 6 | −0.12 % |
| `sharpe` | −2.37 | −3.06 | −3.98 | −2.15 | 0 / 6 | −0.28 % |
| `composite` | −2.08 | −2.84 | −3.48 | −2.68 | 0 / 6 | −0.36 % |

- **MT4 fails every criterion, for every fitness.** Only the protocol holds.
- **`sharpe` and `composite` lose significantly** (t below −2): selecting genomes on the validation Sharpe picks agents that lose after fees out of sample. `total_pnl` is the least bad and stays the default.
- **The seed decides more than the fitness.** With `total_pnl`, the six track records range from a Sharpe of −3.73 to +1.38 (ETH seed 0: +27.6 % a year, Calmar 3.8); the same data with another seed loses 41.7 % a year. Nothing here separates an edge from luck.
- **Buy and hold:** the mean `total_pnl` Sharpe beats it on ETH (+0.03 against −1.09: a falling market, the agent is less exposed) but not on BTC (−1.38 against −0.21).
- The paper trading criterion stays open.

> **Reproducibility note (2026-11-08, PR #589):** the trainer simplification removed genes that never changed (mutation distribution, adaptation, scope, `selfSigma`, …) and with them some RNG draws of the mutation-genome crossover and of the self-adaptive mutation. Same-seed runs stay deterministic, but from that PR on they no longer replay the figures above. Re-run `scripts/mt4-walk-forward.ts` before comparing a new result with this table.

Run of 2026-11-11 ([ADR-0064](./0064-simulated-fills-at-next-bar-open-with-execution-costs.md), issue #883): BTCUSDT and ETHUSDT 1h candles from 2026-08-16 to 2026-11-11 (`fetch-klines.ts`, 2,100 candles), 15 chained test segments per symbol (2026-09-10 → 2026-11-11), 3 seeds, fitness `total_pnl`, position shown, `--features klines`. Both rows run on the same candles and seeds: "next open + costs" is the simulator of ADR-0064 (fill at the next bar's open, 5 bps of half-spread and slippage, 0.1 % fee), "same close, fee only" is the former one (fill at the decision's close, 0.1 % fee), rebuilt for this comparison by setting the cost to 0 and the fill to the close. Buy and hold over the same bars: Sharpe −0.62 (BTC) and −1.85 (ETH), mean segment return −0.62 %.

| Simulator | Sharpe | Sortino | Calmar | t (mean segment return) | Sharpe > 0 | Mean segment return |
| --- | --- | --- | --- | --- | --- | --- |
| next open + costs (5 bps) | −3.31 | −4.24 | −3.90 | −2.51 | 0 / 6 | −0.81 % |
| same close, fee only | −3.51 | −4.47 | −4.29 | −2.62 | 0 / 6 | −0.88 % |

- **MT4 still fails every criterion.** The agents lose significantly out of sample (t below −2) and do worse than buy and hold on both symbols.
- **The cost model does not change the verdict, and its effect is not measurable here**: the realistic simulator scores slightly better, within the spread between seeds (Sharpe −1.53 to −4.66 per track record with costs). Costs also change which genomes the GA selects, so the two rows differ by more than the costs of the same trades. With no edge to erode, this run cannot price the former simulator's optimism; it only removes it from the next runs.
