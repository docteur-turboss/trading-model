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

**Base URL**: `https://<service-host>:<PORT>`

| Route              | Method | Description                                      |
| ------------------ | ------ | ------------------------------------------------ |
| `/ping`            | GET    | Health check (built-in via `createSecureServer`) |
| `/training-status` | GET    | Current training status                          |
| `/best-agent`      | GET    | Best trained agent                               |
| `/address-manager/*` | GET  | Service discovery routes (from AddressManager)   |
| `/message`         | POST   | Message bus callback (market data ingestion)     |

### `GET /ping`

**Response** `200 OK`:

```json
{
  "status": "ok",
  "service": "Trader Trainer",
  "timestamp": "..."
}
```

### `GET /training-status`

**Response** `200 OK`:

```json
{
  "data": {
    "training": true,
    "symbol": "BTCUSDT",
    "generation": 42
  }
}
```

### `GET /best-agent`

Returns the best trained agent summary from the most recent generation.

**Response** `200 OK`:

```json
{
  "data": {
    "agent": {
      "id": "a1b2c3d4",
      "generation": 42,
      "fitness": 1.8345,
      "sharpe": 1.92,
      "avgPnl": 145.32,
      "negFlops": -123456,
      "complexityPenalty": 0,
      "gaControl": {
        "populationSize": 20,
        "elitismFraction": 0.1,
        "survivorFraction": 0.5,
        "episodesPerIndividual": 3,
        "selectionType": "tournament",
        "fitnessType": "total_pnl"
      },
      "network": {
        "inputDim": 32,
        "outputDim": 3,
        "hiddenLayers": [
          { "neurons": 64, "activation": "ReLu" },
          { "neurons": 32, "activation": "ReLu" }
        ]
      },
      "rl": {
        "gamma": 0.99,
        "learningRate": 0.001,
        "epsilonStart": 1.0,
        "epsilonMin": 0.05,
        "epsilonDecay": 0.995
      }
    },
    "training": false,
    "symbol": "BTCUSDT",
    "generation": 42
  }
}
```

**Response** `404 Not Found`:

```json
{
  "data": {
    "status": 404,
    "message": "No trained agent available at the moment."
  }
}
```

### BestAgentSummary Type

| Field             | Type   | Description                              |
| ----------------- | ------ | ---------------------------------------- |
| id                | string | Unique genome identifier                 |
| generation        | number | Generation when this genome was produced |
| fitness           | number | Scalar fitness score                     |
| sharpe            | number | Sharpe-like ratio of episode returns     |
| avgPnl            | number | Average P&L across evaluation episodes   |
| negFlops          | number | Negative FLOPs (complexity indicator)    |
| complexityPenalty | number | Complexity penalty applied to fitness    |
| gaControl         | object | GA meta-parameters used                  |
| network           | object | Neural network architecture              |
| rl                | object | Reinforcement learning hyperparameters   |

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

- **Trigger**: once 50 candles are available for a symbol
- **Frequency**: every 60 seconds
- **Condition**: at least 10% of `TRAINER_DATA_WINDOW` available
- **Parallelism**: one training session at a time (`trainer.isTraining()`)

See [Training Process — Reference](../reference/training-process.md) for the full pipeline description.

## GA & Neural Network Architecture

The trader-trainer implements a **self-adaptive multi-objective genetic algorithm** with configurable feedforward neural networks for Deep Q-Learning. See these docs for detailed reference:

| Doc | Content |
| --- | ------- |
| [Service Architecture](../../services/trader-trainer/ARCHITECTURE.md) | Full module breakdown, design decisions, training loop, performance metrics |
| [GA Reference](../reference/genetic-algorithm.md) | Genome structure, genetic operators, NSGA-II, adaptive control |
| [NN Reference](../reference/neural-network.md) | Network architecture, activation functions, optimizers, loss functions |

## Environment Variables (TRAINER\_\*)

| Variable              | Description                                     |
| --------------------- | ----------------------------------------------- |
| `TRAINER_SYMBOLS`     | Symbols to trade (comma-separated)              |
| `TRAINER_DATA_WINDOW` | Historical data window                          |
| `TRAINER_*`           | Generations, population size, time budget, etc. |

## Rate Limiting

- **Window**: 15 minutes
- **Limit**: 100 requests per window
- Configured in `createSecureServer` within `server.ts`

## TLS

All connections require TLS mutual authentication:

| Variable        | Description           |
| --------------- | --------------------- |
| `TLS_KEY_PATH`  | Server private key    |
| `TLS_CERT_PATH` | Server certificate    |
| `TLS_CA_PATH`   | CA certificate bundle |

## Related Documentation

Detailed implementation reference:

- [Genetic Algorithm](../reference/genetic-algorithm.md)
- [Neural Network](../reference/neural-network.md)
- [Training Process](../reference/training-process.md)
- [Service Architecture](../../services/trader-trainer/ARCHITECTURE.md) — full module breakdown and design decisions
