# Trader-Trainer Architecture

Routes, model artifacts, market data, training loop and environment: [docs/services/trader-trainer.md](../../docs/services/trader-trainer.md). GA, network and training pipeline: [docs/reference/](../../docs/reference/). This file holds the module layout and the design decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Trader-Trainer Service                │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  │
│  │          Genetic Algorithm Runner (GA)            │  │
│  │  - Population management                          │  │
│  │  - Selection, Mutation, Crossover                │  │
│  │  - Adaptive control & termination                │  │
│  └──────────────────────────────────────────────────┘  │
│              ↕                           ↕               │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │   Trading Agent      │    │   Neural Network     │  │
│  │  - Wallet mgmt       │    │  - Forward/Backward  │  │
│  │  - Action mapping    │    │  - Weight updates    │  │
│  │  - Reward calc       │    │  - Batch processing  │  │
│  └──────────────────────┘    └──────────────────────┘  │
│         ↕                               ↕                │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │  Wallet Manager      │    │   State Manager      │  │
│  │  - Buy/Sell trades   │    │  - Epsilon decay     │  │
│  │  - PnL tracking      │    │  - RL hyperparams    │  │
│  │  - Metrics calc      │    │  - Policy storage    │  │
│  └──────────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
      ↑ candles read from financial-scraper (ADR-0044)
      ↓ versioned model export (ADR-0022)
```

## Termination Conditions

The GA loop stops when **any** of these is met (checked in order):

1. `bestFitness >= rewardThreshold`
2. `stagnation >= stagnationPatience`
3. `generation >= maxGenerations`
4. `elapsedMs >= timeBudgetMs`

## Directory Structure

```
services/trader-trainer/
├── src/
│   ├── domain/                        # Pure computation (no IO, no metrics library)
│   │   ├── agent/                     # TradingAgent, state manager, action mapping
│   │   ├── env/                       # Simulated wallet, portfolio valuation, trade execution
│   │   ├── neural-network/            # NN engine, optimizers, losses, experience replay
│   │   ├── genetic-algorithm/         # GA engine: ga-runner, generation processor, evaluation
│   │   │                              # pipeline, evolution engine, NSGA-II, genome operators,
│   │   │                              # ga-telemetry (observability port)
│   │   ├── feature-builders/, features/, data-handlers/, market-data/
│   │   ├── market-data-buffer.ts      # Per-symbol rolling windows
│   │   ├── training-settings.ts       # Hyper-parameters resolved by the composition root
│   │   └── ports/model-publisher.port.ts
│   ├── application/
│   │   ├── index.ts                   # Entry point: bootstrap, training loop
│   │   ├── server.ts                  # Express server + admin training routes
│   │   ├── trainer.ts                 # Training lifecycle per symbol, publication, metrics
│   │   └── training-session.ts        # One GA run with the injected settings and telemetry
│   ├── adapters/
│   │   ├── inbound/scheduler/         # Periodic training loop
│   │   └── outbound/model-publisher.ts # Publishes trained models on the message bus
│   ├── infrastructure/config/env.ts   # Zod-validated environment
│   └── config/
│       ├── container.ts               # Composition root: buffer, trainer, publisher, Prometheus hooks
│       ├── metrics.ts, message-manager.ts, address-manager.ts
├── tests/
├── Dockerfile
└── package.json
```

## Core Modules

- **`domain/agent/`**: `TradingAgent` combines network, wallet and `StateManager` (`step()`, epsilon-greedy action mapping over sell / hold / buy, replay buffer and minibatch Q-learning). `StateManager` holds the RL hyperparameters and the epsilon decay (`updateFromGenome()`). `AutoEnv` lets the GA runners drive a `TradingAgent` without tight coupling.
- **`domain/env/`**: `WalletManager` simulates the account: position limits, transaction fees, realized + unrealized P&L (`buy` / `sell` / `getPnL` / `getValuation` / `setPrice`).
- **`domain/neural-network/`**: [Neural Network — Reference](../../docs/reference/neural-network.md).
- **`domain/genetic-algorithm/`**: [Genetic Algorithm — Reference](../../docs/reference/genetic-algorithm.md) (genome, operators, NSGA-II, fitness ADR-0025, adaptive control).

## Key Design Decisions

1. **Lamarckian evolution** — after each evaluation window, trained weights are frozen back into the genome (`trainedWeights`); offspring inherit them (`ga-runner.ts`, `lamarckianUpdate`).
2. **Walk-forward validation** — fitness is computed only on held-out data, never on the window the agent learned on (`ga-runner.ts`, `WindowSet`; segment rules in the service page).
3. **NSGA-II multi-objective** — **avgPnl** and **sharpe** maximized, **negFlops** (complexity) minimized; a persistent `ParetoArchive` keeps the non-dominated solutions (`pareto-engine.ts`).
4. **Self-adaptive GA control** — population size, elitism fraction and episodes per individual (kept within 10–30) are evolved too (`adaptive-control-system.ts`, `adaptGAControl`).
5. **Immutable genome** — every genome operation returns a new `deepFreeze`d object.
6. **Sequential evaluation** — genomes are evaluated one by one on the training worker thread; each gets its own `TradingAgent` (`ga-runner.ts`, `sequentialEval`).
