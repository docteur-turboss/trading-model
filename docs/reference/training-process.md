# Training Process — Implementation Reference

> **New to training concepts?** See [Training Process — Concepts](../concepts/training-process.md) for explanations of walk-forward validation, feature engineering, and reward shaping before reading this implementation reference.

## End-to-End Flow

## 1. Service Initialization (`src/infrastructure/index.ts`)

On startup:

1. `createBootstrap` initializes Express with TLS, rate limiting, and routes
2. `MessageManager` subscribes to market data events:
   - `fetchCandlestickSeries` — OHLCV candles
   - `fetchRecentTrades` — recent trade data
   - `fetchOrderBookSnapshot` — order book depth
   - `fetchOrderBookTickerSnapshot` — best bid/ask
   - `fetch24hrTickerStats` — 24h statistics
   - `fetchPriceTickerSnapshot` — current price snapshot
3. Data flows into `MarketDataBuffer` which maintains per-symbol state with running normalizers

## 2. Training Trigger

Training starts when **at least 50 candles** (10% of `TRAINER_DATA_WINDOW`) have been received for a symbol. A 60-second interval timer then runs training sessions:

```
startTrainingLoop():
  for each symbol in TRAINER_SYMBOLS, starting after the last one trained:
    if symbol has enough candles and fresh data:
      remember it as the last one trained
      trainer.train(symbol)
      stop (train one symbol per interval)
```

The scan is round-robin: every eligible symbol gets its turn, and a symbol whose training keeps failing does not hold the loop.

## 3. Data Preparation (`MarketDataBuffer`)

For each symbol, `getAllWindows()`:

1. Calls `buildMarketSteps()` to convert raw market data into `MarketStep[]`
   - Each step contains: `price`, `features` (32-dim Float32Array), `timestamp`
   - **Point in time** (ADR-0030): a candle's features read only what was known at its close: the latest order book, book ticker and price ticker received by then (stamped at reception), the latest 24h ticker closed by then, the trades of the minute ending at the close, and normalisation statistics of that data only. Later data never changes an earlier step. Trades received twice (same `tradeId`) count once
2. Splits into train/validation sets using `TRAINER_VALIDATION_SPLIT`

**Feature vector** (32 dimensions):

| Index | Feature                                          |
| ----- | ------------------------------------------------ |
| 0     | Normalized close price                           |
| 1     | Normalized volume                                |
| 2     | Price change %                                   |
| 3     | Close position within candle                     |
| 4     | High-low range / close                           |
| 5-7   | Normalized open, high, low                       |
| 8     | Volume ratio                                     |
| 9-12  | Order book (bid/ask averages, spread, imbalance) |
| 13-15 | Book ticker (bid, ask, spread)                   |
| 16-18 | Recent trades (avg price, volume, buy ratio)     |
| 19-21 | 24h ticker (change, volume, range)               |
| 22    | Price snapshot                                   |
| 23-30 | Last 8 closes sliding window                     |
| 31    | Bias (constant 1.0)                              |

## 4. Training Session (`Trainer.train()`)

1. Creates a `GeneticAlgorithmRunner` with:
   - `windowSets`: train/validation split of market data
   - `backendFactory`: function that creates RLBackends from genomes
   - `initialControl`: population size, generations, time budget, episodes
   - `onGeneration` callback: logs progress, stores best genome
   - `onArchiveUpdate` callback: updates archived best genome

2. Calls `runner.run()` which executes the full GA evolution loop

## 5. Per-Genome Evaluation

Each genome is evaluated on **all window sets**:

```
evaluateGenomeAllWindows(genome, windowSets, factory):
  for each window set:
    1. Create training backend → play the training data, store each decision
       with its own n-step return, replay a minibatch after each store
    2. Extract Lamarckian weights → freeze into genome
    3. Create eval backend → run on the whole validation window (epsilon 0.05)
    5. Collect wallet PnL: per episode and per bar (not the shaped reward)

  Compute (ADR-0025):
  - Fitness of TRAINER_FITNESS_TYPE: total_pnl (mean episode PnL) or
    sharpe / sortino / calmar / composite (bar PnL curve)
  - Complexity penalty (FLOPs + memory)
  - Adjusted fitness = fitness - |fitness| * 0.15 * complexity
  - Objectives: avgPnl (episode PnL), sharpe (bar curve), negFlops
```

## 6. Generation Loop

Repeated until termination:

1. **Evaluate** all genomes in parallel (pooled, concurrency=4)
2. **NSGA-II sort** the population by Pareto rank + crowding distance
3. **Update archive** with non-dominated solutions
4. **Select elites** (top `elitismFraction`)
5. **Select parents** (tournament/roulette/rank)
6. **Crossover** parents → child genomes (structural + weight-level)
7. **Mutate** children (structural + weight-level)
8. **Adapt** GA control parameters
9. **Check termination** conditions

## 7. Post-Training

After training completes:

- Best genome is stored in `Trainer.bestGenome`
- Accessible via `GET /best-agent` endpoint
- The next 60-second interval will trigger training on the next symbol

---

## Key Metrics Logged Per Generation

```
[Trainer] Gen 17: best=2.3456, avg=1.2345, archive=3, stagnation=0, elapsed=12.3s
```

- **best**: Highest fitness in current population
- **avg**: Average fitness across population
- **archive**: Number of non-dominated solutions in Pareto archive
- **stagnation**: Generations without fitness improvement
- **elapsed**: Wall-clock time since training started

---

## Wallet Simulation

Each evaluation creates a `WalletManager` simulating a trading account:

- **Initial state**: 1000 cash, no position
- **Trading**: Buy/sell at market price with configurable fee rate
- **Constraints**: Max position limit, cash sufficiency checks
- **Metrics**: PnL, return %, peak valuation, drawdown, fee tracking

### Reward Calculation

Reward of a decision = PnL at the next decision's price − PnL just before its trade: its trading cost plus the price move on the position it left. It is only known at the next step, so the last decision of the training window is never stored. The window end is a truncation: stored transitions keep their bootstrap (ADR-0025).

Reward shaping (configured in genome):

- `scale`: Multiply by scaleFactor
- `clip`: Clamp to [clipMin, clipMax]
- `normalize`: Z-score normalization on the fly
- `sparse`: Only reward at episode end (the episode total on the last step)

Reward shaping only changes what the agent learns from; fitness never reads it (ADR-0025).

### Episode Reset

Between episodes, wallet resets to initial state, experience pool clears, epsilon resets.

---

## RNG Seeding

Reproducibility via seeded PRNG (mulberry32 algorithm):

- `networkSeed` — initial population generation
- `mutationSeed` — mutation RNG stream (offset by generation)
- Separate RNG instances for mutation and crossover per generation

## Walk-forward validation on real candles (MT4)

```bash
cd services/trader-trainer
bun scripts/fetch-klines.ts BTCUSDT 1h 2100 /tmp/btc-1h.json
bun scripts/mt4-walk-forward.ts --data /tmp/btc-1h.json,/tmp/eth-1h.json --out /tmp/results.json   --segments 15 --seeds 3 --fitness total_pnl,sharpe,composite [--variants shown,hidden] [--features klines]
bun scripts/mt4-walk-forward.ts --merge /tmp/a.json,/tmp/b.json   # summary of parallel runs (--seed-base)
```

For each segment the real GA trains on `--window` candles (500), then the genome it would publish is evaluated on the next `--test` candles (100), which training never saw. The test segments of a symbol, chained, are its out-of-sample track record: the summary gives per symbol and seed the annualised Sharpe, Sortino, return, maximum drawdown and Calmar (return / drawdown), next to buy and hold, then PASS / FAIL against each success criterion of ADR-0030. `--features klines` (default) also feeds the 24h ticker and the trades rebuilt from the candle files; the order book inputs stay 0 (no public history). `--seed-base` lets several processes share the seeds. Results: ADR-0025 (first run), ADR-0030.
