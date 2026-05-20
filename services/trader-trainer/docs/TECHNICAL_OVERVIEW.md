# Technical Overview

## What Is Trader-Trainer?

Trader-Trainer is a **microservice** that evolves populations of neural network-based trading agents using a hybrid **Genetic Algorithm (GA) + Deep Q-Learning (DQN)** approach. It consumes real market data, trains agents in a simulated environment, and exports the best-performing agent for live trading.

---

## Why This Approach?

| Challenge                                                      | Solution                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Trading is a high-dimensional sequential decision problem      | Deep Q-Learning handles state-action value approximation                   |
| Optimal architecture (layers, neurons, activations) is unknown | GA searches the topology space automatically                               |
| RL hyperparameters (lr, gamma, epsilon decay) are hard to tune | GA mutates/crossovers them alongside architecture                          |
| Single training run may produce brittle agents                 | Population-based evolution with Pareto archive preserves diverse solutions |
| Overfitting to recent market conditions                        | Walk-forward validation on held-out windows                                |

The combination means the system discovers **both** the network architecture and the learning parameters, requiring minimal human tuning.

---

## How It Works — High-Level Data Flow

```
Message Manager (market data events)
        │
        ▼
┌───────────────────────────────┐
│   MarketDataBuffer            │
│   - Stores candles, trades,   │
│     order books, tickers      │
│   - Builds normalized 32-dim  │
│     feature vectors           │
│   - Splits train/validation   │
└───────────┬───────────────────┘
            │
            ▼ (every 60s)
┌───────────────────────────────┐
│   Trainer                     │
│   - Creates GA runner         │
│   - Runs evolution loop       │
│   - Exposes best agent via    │
│     /best-agent endpoint      │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│   GeneticAlgorithmRunner      │
│   ┌───────────────────────┐   │
│   │  Generation Loop:     │   │
│   │  1. Evaluate all N    │   │
│   │     genomes in        │   │
│   │     parallel (pooled) │   │
│   │  2. NSGA-II Pareto    │   │
│   │     sort              │   │
│   │  3. Elitism (keep k)  │   │
│   │  4. Select parents     │   │
│   │  5. Crossover genomes │   │
│   │  6. Mutate genomes    │   │
│   │  7. Lamarckian weight │   │
│   │     inheritance       │   │
│   │  8. Adapt GA control  │   │
│   │  9. Check termination │   │
│   └───────────────────────┘   │
└───────────┬───────────────────┘
            │
            ▼ (best genome)
┌───────────────────────────────┐
│   Trader-Executor Service     │
│   (deployed for live trading) │
└───────────────────────────────┘
```

---

## Key Design Decisions

### 1. Lamarckian Evolution (Weight Inheritance)

After each evaluation window, trained neural network weights are **frozen back** into the genome (`trainedWeights`). Offspring inherit these weights (via crossover + mutation), so each generation builds on the knowledge of the previous one rather than starting from scratch.

**File**: `ga-runner.ts:402-409` (`lamarckianUpdate`)

### 2. Walk-Forward Validation

Each symbol's market data is split into `train` (80%) and `validation` (20%) windows. The agent learns on `train` data via Q-learning, but fitness is computed **only on `validation` data** — guaranteeing out-of-sample evaluation.

**File**: `ga-runner.ts:160-164` (`WindowSet` type)

### 3. NSGA-II Multi-Objective Optimization

Three competing objectives are optimized simultaneously:

- **avgPnl** — maximize average profit
- **sharpe** — maximize risk-adjusted return
- **negFlops** — minimize network complexity (as negative FLOPs)

Non-dominated sorting preserves solutions that excel in different trade-offs. A persistent `ParetoArchive` keeps the best solutions across generations.

**File**: `pareto-engine.ts`

### 4. Self-Adaptive GA Control

The GA meta-parameters (population size, elitism fraction, episodes per individual) are **themselves evolved** during training. The `adaptGAControl` function adjusts them based on stagnation and improvement history.

**File**: `adaptive-control-system.ts`

### 5. Immutable Genome Architecture

All genome operations produce **new frozen objects** using `deepFreeze`. This eliminates mutation bugs and enables safe concurrent evaluation across the population.

**File**: `ga-runner.ts:33-57`

### 6. Pooled Parallel Evaluation

Genomes are evaluated concurrently with a configurable concurrency cap (`evalConcurrency`, default 4). Each genome creates its own `RLBackend` (TradingAgent), runs Q-learning training, then evaluates on validation data.

**File**: `ga-runner.ts:676-694` (`pooledEval`)

---

## Directory Structure

```
src/
├── app/
│   ├── index.ts           # Service entry, message bus subscriptions, training loop
│   └── server.ts          # Express server, routes, TLS, rate limiting
├── config/
│   ├── env.ts             # Zod-validated environment variables
│   ├── message-manager.ts # Message bus (broker-message) client
│   └── address-manager.ts # Service discovery client
└── core/
    ├── trainer.ts         # Orchestrates GA training sessions
    ├── market-data-buffer.ts # Feature engineering pipeline
    ├── agent/
    │   ├── trading-agent.ts  # NN + Wallet + StateManager orchestration
    │   ├── state-manager.ts  # Epsilon decay, RL hyperparams
    │   └── auto-env.ts       # GA-compatible environment wrapper
    ├── env/
    │   └── wallet-manager.ts # Simulated trading account
    ├── neural-network/
    │   ├── neural-network.ts # Core feedforward NN
    │   ├── agent.ts          # NN + experience replay + Q-learning
    │   ├── activation.ts     # Activation functions
    │   ├── optimizer.ts      # SGD, Adam, RMSProp
    │   ├── losses.ts         # MSE, CE, Huber
    │   ├── initializers.ts   # Weight initialization
    │   ├── normalize.ts      # Normalization strategies
    │   ├── type.ts           # Type definitions
    │   └── utils.ts          # Utilities
    └── genetic-algorithm/
        ├── ga-runner.ts           # Main evolution loop
        ├── genome.ts              # Genome type definitions
        ├── genome-types.ts        # Re-exports + runtime types
        ├── factory.ts             # Default genome creation
        ├── mutation.ts            # Adaptive mutation operators
        ├── crossover.ts           # Crossover operators
        ├── selection.ts           # Parent selection strategies
        ├── fitness.ts             # Fitness computation
        ├── evaluation-pipeline.ts # Train + eval orchestration
        ├── evolution-engine.ts    # Weight-level genetic operators
        ├── prng.ts                # Seeded PRNG (mulberry32)
        ├── noise.ts               # Noise distributions
        ├── validation.ts          # Genome validation & repair
        ├── complexity.ts          # Topology constraints
        ├── complexity-estimator.ts # FLOPs/memory estimation
        ├── diversity.ts           # Speciation & novelty
        ├── pareto-engine.ts       # NSGA-II sorting & archive
        ├── adaptive-control-system.ts # Self-adaptive parameters
        ├── encoding.ts            # Vectorized genome encoding
        └── index.ts               # Public API barrel export
```

---

## How To Use

### Run the Service

```bash
# Development
npm run dev

# Build & production
npm run build
node dist/app/index.js
```

### Required Environment Variables

| Variable              | Description                 |
| --------------------- | --------------------------- |
| `PORT`                | Service port (default 3000) |
| `TLS_KEY_PATH`        | TLS private key path        |
| `TLS_CERT_PATH`       | TLS certificate path        |
| `TLS_CA_PATH`         | TLS CA bundle path          |
| `APP_NAME`            | Application name            |
| `SERVICE_NAME`        | Service name for discovery  |
| `INSTANCE_ID`         | Unique instance identifier  |
| `ADDRESS_MANAGER_URL` | Address manager service URL |
| `ERROR_URL_WEBHOOK`   | Error reporting webhook URL |

### Training Configuration (Environment Variables)

| Variable                          | Default           | Description                          |
| --------------------------------- | ----------------- | ------------------------------------ |
| `TRAINER_SYMBOLS`                 | `BTCUSDT,ETHUSDT` | Trading pairs to train on            |
| `TRAINER_DATA_WINDOW`             | `500`             | Max candles to keep per symbol       |
| `TRAINER_VALIDATION_SPLIT`        | `0.2`             | Fraction of data for validation      |
| `TRAINER_GENERATIONS`             | `50`              | Max generations per training session |
| `TRAINER_POPULATION_SIZE`         | `20`              | Initial population size              |
| `TRAINER_TIME_BUDGET_MS`          | `300000`          | Max training time (5 min)            |
| `TRAINER_EPISODES_PER_INDIVIDUAL` | `3`               | Episodes per genome evaluation       |

### Query the Best Agent

```bash
curl -k https://localhost:3000/best-agent
curl -k https://localhost:3000/training-status
```

---

## How To Improve

### Performance Tuning

| Goal                  | Change                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Faster training       | Reduce `populationSize` (10-15), reduce `generations` (20-30), reduce `episodesPerIndividual` (1-2)           |
| Better agents         | Increase `populationSize` (50-100), increase `generations` (100-200), increase `episodesPerIndividual` (5-10) |
| Lower memory          | Reduce `TRAINER_DATA_WINDOW`, reduce `replayBuffer.bufferSize` in genome defaults                             |
| Better generalization | Increase `TRAINER_VALIDATION_SPLIT` (0.3-0.4)                                                                 |

### Adding New Features

1. **New fitness metric**: Add to `FitnessType` in `genome.ts:140`, implement in `fitness.ts:18-67`
2. **New mutation operator**: Add to `MutationDistribution` in `genome.ts:99`, implement in `noise.ts`, wire in `mutation.ts`
3. **New crossover operator**: Add to `CrossoverType` in `genome.ts:128`, implement in `crossover.ts`
4. **New selection strategy**: Add to `SelectionType` in `genome.ts:139`, implement in `selection.ts`
5. **New feature in observation vector**: Modify `MarketDataBuffer.buildFeatures()` in `market-data-buffer.ts:211-286`, update `FEATURE_DIM` and `inputDim` in factory

### Debugging

```bash
# Enable debug logging
DEBUG=trader-trainer:* npm run dev

# Run tests
npm test

# Coverage
npm test -- --coverage
```

---

## Termination Conditions

The GA loop stops when **any** of these conditions is met (checked in order):

1. `bestFitness >= rewardThreshold` — target fitness reached
2. `stagnation >= stagnationPatience` — no improvement for N generations
3. `generation >= maxGenerations` — max generations reached
4. `elapsedMs >= timeBudgetMs` — time budget exhausted

**File**: `ga-runner.ts:876-883`
