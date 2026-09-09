# Trader-Trainer Service

> Autonomous trading AI agents trained via **Genetic Algorithm + Deep Q-Learning**

## Overview

Trader-Trainer is a microservice that evolves a population of neural network-based trading agents using genetic algorithms and deep reinforcement learning. It consumes real market data from the **Message Manager** service and produces optimized trading agents ready for deployment to **Trader-Executor**.

Key features: GA evolution, Deep Q-Learning, memory-aware scaling, adaptive control, multi-objective optimization (Sharpe, Sortino, Calmar, P&L).

## Quick Start

```bash
cd services/trader-trainer
bun install
bun run dev           # Development server
bun run test              # Run tests
bun run build         # Production build
```

See [Quick Start](../../docs/getting-started/quickstart.md) for a full platform walkthrough.

## Architecture

```
Real Market Data → [Trader-Trainer] → Best Agent → Trader-Executor
                    ├─ Genetic Algorithm (population evolution)
                    ├─ Neural Network Agents (Q-Learning)
                    ├─ Trading Wallet Simulation
                    └─ Fitness Evaluation (Sharpe, Sortino, etc.)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed module breakdown and integration.

## Documentation

| Document | Content |
| -------- | ------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, core modules, design decisions |
| [Centralized Service Doc](../../docs/services/trader-trainer.md) | REST API, config, dependency overview |
| [GA Reference](../../docs/reference/genetic-algorithm.md) | Genome structure, operators, NSGA-II |
| [NN Reference](../../docs/reference/neural-network.md) | Network architecture, activations, optimizers |
| [Training Process](../../docs/reference/training-process.md) | End-to-end training flow, data preparation |

## Related

- [Bounded Contexts](../../docs/architecture/bounded-contexts.md) — DDD context map
- [Service Documentation Index](../../docs/services/README.md) — All platform services
