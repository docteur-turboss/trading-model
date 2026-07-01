# ADR-0001: Genetic Algorithm + Deep Q-Learning for Agent Training

**Status:** Accepted
**Date:** 2026-06

## Context

The platform needs to train autonomous trading agents that can adapt to changing market conditions. The agents must balance exploration (finding new strategies) with exploitation (using known profitable strategies) across a continuous action space (buy, sell, hold with varying quantities).

## Decision

Use a hybrid approach combining **Genetic Algorithms (GA)** for population-level evolution with **Deep Q-Learning (DQN)** for individual agent optimization.

### Architecture

- **GA layer**: Maintains a population of agent genomes. Each genome encodes neural network architecture parameters (layer sizes, activation functions, learning rates) and initial weights.
- **DQN layer**: Each agent wraps a neural network trained via Q-learning with experience replay. The GA evolves the hyperparameters and initial weights; DQN fine-tunes weights during each agent's lifetime.
- **Fitness function**: Composite of Sharpe ratio, Sortino ratio, Calmar ratio, and total P&L, with complexity penalty.
- **Selection**: Tournament selection with elitism (top 10% preserved).
- **Crossover**: BLX-alpha crossover for real-valued genome blending.
- **Mutation**: Adaptive Gaussian mutation with diversity-based rate adjustment.

## Alternatives Considered

| Alternative | Reason for Rejection |
|---|---|
| Pure DQN (single agent) | Converges to local optima; no population diversity |
| Pure GA (no learning) | Cannot adapt within a generation; slow convergence |
| PPO / SAC (policy gradient) | Higher sample complexity; harder to parallelize across population |
| Evolutionary Strategies (ES) | Less sample-efficient than GA + DQN for this domain |

## Consequences

### Positive

- Population diversity prevents premature convergence
- GA discovers novel architectures, DQN optimizes weights within each generation
- Parallel evaluation of agents maps naturally to multi-core / distributed compute
- Composite fitness captures multiple trading objectives

### Negative

- Increased computational cost vs. single-agent RL
- Longer training time per generation (each agent evaluates on market windows)
- Complex hyperparameter space (GA params + DQN params + fitness weights)

### Mitigations

- Memory-aware population sizing (auto-scales based on available RAM)
- Adaptive control system adjusts mutation/crossover rates automatically
- Pareto archiving preserves non-dominated solutions across generations
