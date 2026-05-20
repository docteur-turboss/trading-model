# Training Process

## End-to-End Flow

### 1. Service Initialization (`app/index.ts`)

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

### 2. Training Trigger

Training starts when **at least 50 candles** (10% of `TRAINER_DATA_WINDOW`) have been received for a symbol. A 60-second interval timer then runs training sessions:

```
startTrainingLoop():
  for each symbol in TRAINER_SYMBOLS:
    if symbol has enough candles:
      trainer.train(symbol)
      break (train one symbol per interval)
```

### 3. Data Preparation (`MarketDataBuffer`)

For each symbol, `getAllWindows()`:

1. Calls `buildMarketSteps()` to convert raw market data into `MarketStep[]`
   - Each step contains: `price`, `features` (32-dim Float32Array), `timestamp`
2. Splits into train/validation sets using `TRAINER_VALIDATION_SPLIT`

**Feature vector** (32 dimensions):
| Index | Feature |
|-------|---------|
| 0 | Normalized close price |
| 1 | Normalized volume |
| 2 | Price change % |
| 3 | Close position within candle |
| 4 | High-low range / close |
| 5-7 | Normalized open, high, low |
| 8 | Volume ratio |
| 9-12 | Order book (bid/ask averages, spread, imbalance) |
| 13-15 | Book ticker (bid, ask, spread) |
| 16-18 | Recent trades (avg price, volume, buy ratio) |
| 19-21 | 24h ticker (change, volume, range) |
| 22 | Price snapshot |
| 23-30 | Last 8 closes sliding window |
| 31 | Bias (constant 1.0) |

### 4. Training Session (`Trainer.train()`)

1. Creates a `GeneticAlgorithmRunner` with:
   - `windowSets`: train/validation split of market data
   - `backendFactory`: function that creates RLBackends from genomes
   - `initialControl`: population size, generations, time budget, episodes
   - `onGeneration` callback: logs progress, stores best genome
   - `onArchiveUpdate` callback: updates archived best genome

2. Calls `runner.run()` which executes the full GA evolution loop

### 5. Per-Genome Evaluation

Each genome is evaluated on **all window sets**:

```
evaluateGenomeAllWindows(genome, windowSets, factory):
  for each window set:
    1. Create shadow backend → precompute rewards on training data
    2. Create training backend → run Q-learning training
    3. Extract Lamarckian weights → freeze into genome
    4. Create eval backend → run on validation data
    5. Collect episode returns

  Compute:
  - Fitness from episode returns (total_pnl / sharpe / sortino / composite)
  - Complexity penalty (FLOPs + memory)
  - Adjusted fitness = fitness * (1 - 0.15 * complexity)
  - Objectives: avgPnl, sharpe, negFlops
```

### 6. Generation Loop

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

### 7. Post-Training

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

Per-step reward = `PnL_after_trade - PnL_before_trade`

Reward shaping (configured in genome):

- `scale`: Multiply by scaleFactor
- `clip`: Clamp to [clipMin, clipMax]
- `normalize`: Z-score normalization on the fly
- `sparse`: Only reward at episode end (use final PnL)

### Episode Reset

Between episodes, wallet resets to initial state, experience pool clears, epsilon resets.

---

## RNG Seeding

Reproducibility via seeded PRNG (mulberry32 algorithm):

- `networkSeed` — initial population generation
- `mutationSeed` — mutation RNG stream (offset by generation)
- Separate RNG instances for mutation and crossover per generation
