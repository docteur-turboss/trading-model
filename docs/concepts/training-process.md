# Training Process — Concepts

## Overview

The training process combines market data ingestion, feature engineering, genetic algorithms, and deep reinforcement learning to evolve profitable trading agents. This document explains the **what** and **why** of the training pipeline.

## End-to-End Flow (Conceptual)

```
Market Data → Feature Engineering → Walk-Forward Split → GA Evolution → Best Agent
```

## Walk-Forward Validation

A time-series validation technique essential for financial applications. Unlike random train/test splits (which leak future information), walk-forward validation respects temporal order:

```
|--------- Training Window (80%) ---------|--- Validation Window (20%) ---|
                                           ↑
                                     Agent is evaluated here
                                     on data it has never seen
```

The agent trains on the training window via Q-learning, and fitness is computed **only on the held-out validation window**. This prevents overfitting to historical patterns and provides a realistic estimate of out-of-sample performance.

## Feature Engineering

Raw market data (prices, volumes, order book) is transformed into a 32-dimensional feature vector per time step. The features capture:

| Category | Dimensions | Purpose |
| -------- | ---------- | ------- |
| Price action | 8 | Normalized OHLCV, price changes, candle position |
| Volume | 2 | Volume and volume ratio |
| Order book | 8 | Bid/ask averages, spread, imbalance, book ticker |
| Trades | 3 | Recent trade price, volume, buy/sell ratio |
| Ticker | 4 | 24h stats: change, volume, range, price snapshot |
| History | 7 | Last 8 closes sliding window |
| Bias | 1 | Constant 1.0 (bias term) |

Normalization (z-score or min-max) is applied per-symbol with running statistics, ensuring the network receives stable inputs despite changing market prices.

## Training Loop

```
Every 60 seconds:
  For each symbol (one per cycle):
    1. Check if enough data is available (≥ 10% of window)
    2. Split data into train/validation sets
    3. Run GA evolution:
       a. Evaluate each genome on training data (Q-learning)
       b. Score genomes on validation data (fitness)
       c. Sort by NSGA-II (Pareto rank + crowding distance)
       d. Select elites, select parents, crossover, mutate
       e. Adapt control parameters
       f. Check termination
    4. Store best genome
```

## Reward Shaping

The agent receives a reward after each trading step:

```
reward = PnL_after_trade - PnL_before_trade
```

This can be shaped to encourage desired behaviors:

| Strategy | Effect |
| -------- | ------ |
| **Scale** | Amplify or dampen reward magnitude |
| **Clip** | Cap extreme rewards to prevent instability |
| **Normalize** | Adapt to changing volatility |
| **Sparse** | Reward only at episode end (forces long-term thinking) |

## Wallet Simulation

Each evaluation creates a virtual trading account:

- **Initial capital**: 1000 units
- **Trading**: Buy/sell at market price with configurable fees
- **Constraints**: Max position size, cash sufficiency checks
- **Metrics tracked**: P&L, return %, peak valuation, drawdown, fees

## Complexity Penalty

Larger neural networks are more computationally expensive and prone to overfitting. A complexity penalty encourages simpler architectures:

```
adjusted_fitness = raw_fitness × (1 - 0.15 × complexity_penalty)
```

Complexity is estimated from FLOPs (floating-point operations) and memory usage.

## Reproducibility

Seeded pseudo-random number generators ensure reproducible runs:

- Separate seeds for network generation and mutation
- Seeds are deterministic for given parameters
- Enables debugging and comparison of different configurations

---

For implementation details — service structure, training trigger, API — see [Training Process Reference](../reference/training-process.md).
