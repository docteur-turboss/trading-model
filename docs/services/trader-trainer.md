# trader-trainer â€” Genetic Algorithm Trading Trainer

Training service for trading agents using genetic algorithms and neural networks.

## General Information

| Property         | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Service name     | `trader-trainer`                                                                  |
| Port (host)      | `8446`                                                                                     |
| Port (container) | `3000`                                                                                     |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, `@trading-model/broker-message` |

## REST Endpoints

**Base URL**: `https://<service-host>:<PORT>`

| Route                      | Method | Description                                         |
| -------------------------- | ------ | --------------------------------------------------- |
| `/ping`                    | GET    | Health check (built-in via `createServiceServer`)   |
| `/health/ready`            | GET    | Readiness (message bus)                             |
| `/training-status`         | GET    | Current training status                             |
| `/best-agent`              | GET    | Best trained agent                                  |
| `/training-agents`         | GET    | Trained agents of every symbol                      |
| `/training-agents/:symbol` | GET    | Trained agent of one symbol, with its latest model  |
| `/models/:symbol`          | GET    | Stored model versions of a symbol, newest first     |
| `/models/:symbol/:version` | GET    | Manifest of a model version (no weights)            |
| `/models/:symbol/:version/weights` | GET | Weights: service-to-service only, `MODEL_DOWNLOAD_CALLERS` |
| `/status`                  | GET    | Address-manager metrics snapshot                    |
| `/metrics`                 | GET    | Prometheus metrics                                  |
| `/message`                 | POST   | Message bus callback (market data ingestion)        |

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
      "maxDrawdown": 38.5,
      "gaControl": {
        "populationSize": 20,
        "elitismFraction": 0.1,
        "survivorFraction": 0.5,
        "episodesPerIndividual": 10,
        "selectionType": "tournament",
        "fitnessType": "total_pnl"
      },
      "network": {
        "inputDim": 33,
        "outputDim": 3,
        "hiddenLayers": [
          { "neurons": 64, "activation": "ReLu" },
          { "neurons": 32, "activation": "ReLu" }
        ]
      },
      "rl": {
        "gamma": 0.9,
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
{ "error": "No trained agent available at the moment." }
```

Successful responses are wrapped in `{ "data": ... }`; errors are not. Parameters and responses are declared in `src/adapters/inbound/http/api-routes.ts` (`TRAINER_API`, ADR-0021) and published in the [OpenAPI](openapi/api-gateway.yaml). Invalid input answers 400 `{ "error": "Validation failed", "details": [...] }`. `GET /training-agents/:symbol` sends the agent and `model`, the latest stored artifact of the symbol (version, sha256, metrics), never the population or weights.

### Model artifacts (ADR-0022)

After each successful training, the best agent is stored as an immutable version under `TRAINER_MODEL_DIR` (`/data/checkpoints/models`, the checkpoint volume shared by the replicas and backed up encrypted):

```
<SYMBOL>/<yyyymmddThhmmssZ>-<sha12>/manifest.json   genome without weights, feature layout, normalization, metrics
<SYMBOL>/<yyyymmddThhmmssZ>-<sha12>/weights.f32     float32 little-endian, sha256 in the manifest
```

The `TRAINER_MODEL_RETENTION` newest versions are kept per symbol (default 20). A failed write is logged and counted (`tt_model_artifacts_total{result}`: `stored`, `skipped` when the best genome has no trained weights, `error`); the training result is kept either way.

`GET /models/:symbol` and `GET /models/:symbol/:version` are public. The weights (`GET /models/:symbol/:version/weights`) are not proxied by the gateway: a service calls the trainer over mTLS, and its SPIFFE identity must be listed in `MODEL_DOWNLOAD_CALLERS` (empty by default: 403 for everybody). The response is `application/octet-stream` with the sha256 in `x-model-sha256`; check it against the manifest.

### BestAgentSummary Type

| Field             | Type   | Description                              |
| ----------------- | ------ | ---------------------------------------- |
| id                | string | Unique genome identifier                 |
| generation        | number | Generation when this genome was produced |
| fitness           | number | Scalar fitness of `gaControl.fitnessType` (ADR-0025) |
| sharpe            | number | Sharpe ratio of the bar-by-bar PnL curve of the evaluation, annualised from the bar spacing (ADR-0025) |
| avgPnl            | number | Average P&L across evaluation episodes   |
| maxDrawdown       | number | Largest fall of the cumulative bar-by-bar P&L of the evaluation, from its peak (>= 0) |
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

Candles are kept strictly increasing in time per symbol: a candle with the timestamp of the last one replaces it, an older one is dropped, and neither is counted again by the normalizers. A training refuses to start on a series with duplicated or out-of-order timestamps, since a repeated candle would sit in both a training and a validation window.

## Training Loop

- **Frequency**: every 60 seconds
- **Condition**: `hasEnoughTrainingData` (`domain/market-data/window-splitter.ts`), the rule the validator applies too. With `steps = candles - 1`: `steps >= MIN_TRAINING_STEPS`, and either walk-forward is on (`TRAINER_WALK_FORWARD_FOLDS >= 2`) with `steps >= MIN_TRAINING_STEPS × folds`, or `floor(steps × (1 - TRAINER_VALIDATION_SPLIT)) >= MIN_TRAINING_STEPS`. It does not depend on `TRAINER_DATA_WINDOW`
- **Parallelism**: one training session at a time (`trainer.isTraining()`)
- **Rotation**: each cycle trains one symbol of `TRAINER_SYMBOLS`, round-robin. The scan starts after the last symbol trained and takes the first eligible one (enough candles, fresh data). Every eligible symbol gets its turn; a symbol that keeps failing does not hold the loop; a skipped symbol (stale or filling) is checked again on the next cycle

See [Training Process â€” Reference](../reference/training-process.md) for the full pipeline description.

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
| `TRAINER_MODEL_DIR`   | Model artifacts directory (`/data/checkpoints/models`) |
| `TRAINER_MODEL_RETENTION` | Versions kept per symbol (default 20)        |
| `MODEL_DOWNLOAD_CALLERS` | Services allowed to download weights (comma-separated, empty: nobody) |

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
- [Service Architecture](../../services/trader-trainer/ARCHITECTURE.md) â€” full module breakdown and design decisions
