# Genetic Algorithm — Concepts

## Overview

A **Genetic Algorithm (GA)** is an evolutionary optimization technique inspired by natural selection. A population of candidate solutions (genomes) evolves over generations through selection, crossover, and mutation. Each genome's quality is measured by a **fitness function** — the higher the fitness, the more likely it reproduces.

The platform uses GA to evolve trading agents by optimizing both neural network architecture and reinforcement learning hyperparameters simultaneously.

## Why a Genetic Algorithm?

Trading agent design involves many interdependent choices: network depth, layer widths, learning rate, exploration schedule, reward shaping, etc. Manual tuning is impractical because:

- The search space is large and non-convex
- Interactions between parameters are complex (e.g., a deeper network may need a different learning rate)
- The optimal configuration depends on market conditions

GAs excel in this setting because they maintain a diverse population of solutions, explore the search space globally, and are robust to local optima.

## Core Concepts

### Genome

A genome is the encoded representation of a candidate solution. In this platform, a genome encodes:

- **Network architecture**: number and size of hidden layers, activation functions, connection types
- **RL hyperparameters**: learning rate, discount factor (gamma), exploration schedule (epsilon)
- **GA meta-parameters**: mutation rate, crossover strategy, selection type
- **Lamarckian weights**: trained neural network weights inherited from evaluation (see below)

### Population

A set of genomes that evolves over generations. A typical population starts with 20 individuals, generated with random parameters, and adapts its size dynamically based on stagnation.

### Fitness Function

A metric evaluating how well a genome performs. The platform supports:

| Type | Formula | Use case |
| ---- | ------- | -------- |
| Total P&L | `mean(rewards)` | Simple profit maximization |
| Sharpe ratio | `mean / std` | Risk-adjusted returns |
| Sortino ratio | `mean / downside_std` | Downside-risk focus |
| Calmar ratio | `mean / max_drawdown` | Drawdown-averse |
| Composite | Weighted combination | Balanced optimization |

A complexity penalty discourages overly large networks: `adjusted_fitness = fitness × (1 - 0.15 × complexity_penalty)`.

## Evolutionary Operators

### Selection

Selects parents for reproduction. Strategies:

| Strategy | Behavior |
| -------- | -------- |
| **Tournament** (default) | Pick k=3 random individuals, return the fittest |
| **Roulette** | Fitness-proportionate probability |
| **Rank** | Rank-based probability |
| **Truncation / SUS** | Random from top fraction |

### Crossover

Combines two parent genomes to produce offspring. Two levels:

- **Structural crossover**: mixes network topology (layer counts, neuron counts) and RL hyperparameters
- **Weight-level crossover**: mixes trained weight arrays from both parents

| Type | Formula | Use case |
| ---- | ------- | -------- |
| Uniform | Randomly pick from either parent | Topology mixing |
| Arithmetic | `lerp(a, b, α)` | Smooth blending |
| BLX-α | Extended range exploration | Escaping local optima |
| SBX | Simulated Binary Crossover | Real-valued optimization |

### Mutation

Random perturbations to maintain diversity. Two levels:

- **Structural mutation**: neuron counts, activation functions, RL hyperparameters, layer add/remove
- **Weight-level mutation**: Gaussian noise on trained weights

Mutation can use different noise distributions:

| Distribution | Characteristics | Use case |
| ------------ | --------------- | -------- |
| Gaussian | Fine-grained, local | Fine-tuning |
| Lévy | Heavy-tailed | Escaping local optima |
| Cauchy | Heavy-tailed | Rare large jumps |
| Uniform | Flat exploration | Broad search |

### Elitism

A fraction of the best-performing individuals survives unchanged to the next generation, preserving high-quality solutions.

## Multi-Objective Optimization

### NSGA-II

The platform uses **Non-dominated Sorting Genetic Algorithm II** (NSGA-II) for multi-objective optimization. Instead of combining objectives into a single score, NSGA-II:

1. **Ranks** individuals by Pareto dominance (non-dominated solutions get rank 0, solutions dominated only by rank 0 get rank 1, etc.)
2. **Spreads** solutions within each rank using **crowding distance** (preferring solutions in less crowded regions)
3. Selects based on rank first, crowding distance second

This maintains diversity along the Pareto front — the set of solutions where no objective can be improved without degrading another.

### Pareto Archive

A persistent store of all non-dominated solutions discovered across generations. A candidate is accepted if no existing archive member dominates it. Dominated members are evicted. The archive preserves the best trade-offs found during the entire evolution.

### Objectives

Three competing objectives are optimized:

| Objective | Direction | Description |
| --------- | --------- | ----------- |
| `avgPnl` | Maximize | Average profit and loss |
| `sharpe` | Maximize | Risk-adjusted return |
| `negFlops` | Maximize (negated) | Negative complexity (fewer FLOPs = better) |

## Adaptive Control

GA meta-parameters adjust dynamically based on stagnation:

| Condition | Adjustment |
| --------- | ---------- |
| Stagnation > 5 generations | Increase population (up to 80) |
| Improving | Decrease population (down to 8) |
| Stagnation > 8 | Increase elitism (up to 0.3) |
| Stagnation > 6 | More episodes per evaluation |

## Lamarckian Inheritance

Unlike Darwinian evolution (where traits are inherited but learned knowledge is not), **Lamarckian inheritance** writes trained neural network weights back into the genome before reproduction. Offspring inherit both the genetic blueprint AND the learned knowledge of their parents.

This accelerates evolution because each generation starts from the learned weights of the previous generation rather than from random initialization.

## Termination

Evolution stops when any condition is met:

- A fitness threshold is reached
- Stagnation exceeds patience limit
- Maximum generations reached
- Time budget exhausted

---

For implementation details — module structure, TypeScript API, code snippets — see [Genetic Algorithm Reference](../reference/genetic-algorithm.md).
