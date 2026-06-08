# trader-trainer — Genetic Algorithm Trading Trainer

Training service for trading agents using genetic algorithms and neural networks.

## General Information

| Property         | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Service name     | `trader-training-service`                                                                  |
| Port (host)      | `8446`                                                                                     |
| Port (container) | `3000`                                                                                     |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, `@trading-model/broker-message` |

## REST Endpoints

| Route              | Method | Description                                      |
| ------------------ | ------ | ------------------------------------------------ |
| `/ping`            | GET    | Health check (built-in via `createSecureServer`) |
| `/training-status` | GET    | Current training status                          |
| `/best-agent`      | GET    | Best trained agent                               |

### GET /training-status

```json
{
  "data": {
    "training": true,
    "symbol": "BTCUSDT",
    "generation": 42
  }
}
```

### GET /best-agent

```json
{
  "data": {
    "agent": {
      /* best agent summary */
    },
    "training": true,
    "symbol": "BTCUSDT",
    "generation": 42
  }
}
```

Returns `404` if no agent has been trained yet.

## Market Data Subscription

The service subscribes to **6 topics** via the message-manager:

| Topic                                     | Data                |
| ----------------------------------------- | ------------------- |
| `market.candlestick.series.fetch`         | OHLCV candles       |
| `market.trade.recent.fetch`               | Recent trades       |
| `market.order-book.snapshot.fetch`        | Order book snapshot |
| `market.order-book-ticker.snapshot.fetch` | Best bid/ask        |
| `market.ticker.24hr-stats.fetch`          | 24h statistics      |
| `market.price-ticker.snapshot.fetch`      | Current price       |

Data is stored in a `MarketDataBuffer` (configurable window via `TRAINER_DATA_WINDOW`).

## Training Loop

1. **Trigger**: once 50 candles are available for a symbol
2. **Frequency**: every 60 seconds
3. **Condition**: at least 10% of `TRAINER_DATA_WINDOW` available
4. **Parallelism**: one training session at a time (`trainer.isTraining()`)

## GA Components (Genetic Algorithm)

- **Population**: set of agents
- **Genome**: neural network parameter encoding (`genome.ts`)
- **Selection**: best individual selection (elitism + tournament, `selection.ts`)
- **Crossover**: two-parent genome recombination (`crossover.ts`)
- **Mutation**: random gene perturbation (`mutation.ts`)
- **Fitness**: performance function (returns, Sharpe ratio, drawdown, `fitness.ts`)
- **Evaluation Pipeline**: multi-window train/eval with Lamarckian inheritance (`evaluation-pipeline.ts`)
- **Pareto Front**: multi-objective optimisation via NSGA-II (`pareto-engine.ts`)
- **Adaptive Control**: self-adaptive GA parameter control (`adaptive-control-system.ts`)
- **Complexity Estimation**: FLOPs and memory complexity penalty (`complexity-estimator.ts`)
- **Validation**: genome validation co-located with types (`genome.ts` → `validation.ts`)

## Neural Network

Configurable via `NeuralNetworkConfig` (a composition of focused interfaces per ISP):

| Interface              | Properties                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NetworkArchitecture`  | neuronsByLayer, activationType, connectionType, normalisationType, normalizedInputRange, enablePool, poolMaxSize |
| `LossConfig`           | lossFunctionType, deltaHuber                                                                                     |
| `OptimizerConfig`      | optimizerType, optimizerHyperparams, learningRate, gradientClipNorm                                              |
| `InitializationConfig` | initialisationType, useBias, biasInitialisationType                                                              |
| `MutationConfig`       | biasMutationScale, weightMutationScale                                                                           |

- Activation functions: ReLU, sigmoid, tanh, etc.
- Optimisers: Adam, SGD, etc.
- Weights encoded in the genetic algorithm genome
- `Agent` accepts `NetworkArchitecture` only (ISP) and passes through to `NeuralNetwork`

## Environment Variables (TRAINER\_\*)

| Variable              | Description                                     |
| --------------------- | ----------------------------------------------- |
| `TRAINER_SYMBOLS`     | Symbols to trade (comma-separated)              |
| `TRAINER_DATA_WINDOW` | Historical data window                          |
| `TRAINER_*`           | Generations, population size, time budget, etc. |

## Related Documentation

Detailed component documentation is available in:

- `services/trader-trainer/docs/NEURAL_NETWORK.md`
- `services/trader-trainer/docs/GENETIC_ALGORITHM.md`
- Other files in `services/trader-trainer/docs/`
