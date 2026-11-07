# Genetic Algorithm Module — Implementation Reference

> **New to GA concepts?** See [Genetic Algorithm — Concepts](../concepts/genetic-algorithm.md) for an explanation of NSGA-II, Pareto fronts, selection strategies, and evolutionary operators before reading this implementation reference.

## Overview

This document describes the GA module (`src/domain/genetic-algorithm/`) implementation. It covers the TypeScript API, module structure, code conventions, and configuration defaults.

---

## Genome Structure

A `LamarckGenome` contains everything needed to create and train a trading agent:

```
LamarckGenome {
  id: string
  generation: number
  network: NetworkGenome          # Architecture
  rl: RLGenome                    # RL hyperparameters
  mutation: MutationGenome        # Self-adaptive mutation params
  crossover: CrossoverGenome      # Crossover config
  gaControl: GAControlGenome      # GA meta-parameters
  fitness?: number                # Assigned after evaluation
  fitnessMeta?: GenomeFitnessMeta # Detailed metrics
  trainedWeights?: Float32Array   # Lamarckian weight snapshot
}
```

### NetworkGenome

| Field           | Type          | Description                                           |
| --------------- | ------------- | ----------------------------------------------------- |
| `inputDim`      | number        | Input size (fixed at 32 for current feature pipeline) |
| `outputDim`     | number        | Output size (3 for discrete buy/hold/sell)            |
| `hiddenLayers`  | LayerGenome[] | Variable-length array of hidden layers                |
| `normalization` | string        | Input normalization strategy                          |

### RLGenome

Controls Q-learning behavior. Every field is evolved by the GA (mutation when `mutation.mutateHyperparams`, crossover always; switches flip with a 5 % chance per mutation) and every field changes what the agent learns (`dqn-learning.spec.ts`, ADR-0025):

| Sub-module       | Key fields                                                | Purpose                                    |
| ---------------- | --------------------------------------------------------- | ------------------------------------------ |
| (scalars)        | gamma, learningRate                                       | Discount, network learning rate            |
| `rewardShaping`  | clip, scale, normalize, sparse                            | What the agent learns from its wallet PnL  |
| `horizon`        | maxEpisodeLength, nStepReturn, frameSkip                  | Training horizon, n-step return, decision period |
| `discretePolicy` | epsilonStart, epsilonMin, epsilonDecay                    | Epsilon-greedy exploration (training only) |
| `replayBuffer`   | bufferSize, batchSize, prioritized, alphaPER, betaPER, betaAnneal | Experience replay (minibatch, PER)  |

The agent picks among three discrete actions (sell / hold / buy): Q-learning cannot learn a continuous policy, so the genome has no continuous-policy genes.

### Default Configuration

Defined in `factory.ts`. Key defaults:

- 2 hidden layers: [64, 32] with ReLU activation
- Input: 33 = 32 market features + the agent's exposure (`NETWORK_INPUT_LAYOUT`)
- Q-learning: gamma=0.9, learning rate 1e-3, 1-step return
- Epsilon-greedy: start=1.0, min=0.05, decay=0.995
- Replay buffer: 10,000 experiences, minibatch of 8
- Population: 20 individuals, 50 max generations
- Mutation rate: 0.1, sigma: 0.05

---

## GA Loop (Generation Cycle)

Each generation follows this sequence in `GeneticAlgorithmRunner.runGeneration()`:

### 1. Evaluation Phase (`evaluateGenomeAllWindows`)

For each genome in the population:

1. **Training pass**: Create a backend, play the training data once; each decision is stored with the wallet PnL it earned until the next decision (n-step return, shaped by the genome) and a minibatch is replayed after each store
2. **Lamarckian update**: Extract trained weights, freeze them into the genome
3. **Validation pass**: Create a fresh backend with Lamarckian weights, evaluate on held-out validation data at a fixed epsilon of 0.05
4. **Scoring**: Compute fitness from the wallet PnL (`TRAINER_FITNESS_TYPE`), apply complexity penalty

All genomes are evaluated in parallel using a bounded thread pool (`pooledEval`).

### 2. NSGA-II Sorting

The population is sorted using **non-dominated sorting** with crowding distance:

- **Exact O(n²)** sorting for populations ≤ 300
- **Approximate O(n·k)** sampling for larger populations
- Three objectives: avgPnl, sharpe, negFlops

### 3. Pareto Archive Update

The persistent `ParetoArchive` stores all non-dominated solutions discovered across generations. A candidate is accepted if no existing archive member dominates it. Dominated members are evicted.

### 4. Elitism

The top `elitismFraction * populationSize` individuals (by Pareto rank + crowding distance) survive directly to the next generation.

### 5. Parent Selection

Parents are selected using the configured strategy:

- **Tournament** (default): Pick k=3 random individuals, return the fittest
- **Roulette**: Fitness-proportionate selection
- **Rank**: Rank-based selection
- **Truncation / SUS**: Random from top fraction

### 6. Crossover

Two types of crossover applied sequentially:

**Structural crossover** (`crossover.ts`): Mixes network topology and RL hyperparameters:

- Hidden layer counts: blend or inherit from longer parent
- Per-layer: neuron count (scalar crossover), activation/connection/bias (uniform)
- RL params: scalar crossover (arithmetic, BLX-α, SBX, or uniform)

**Weight-level crossover** (`evolution-engine.ts`): Uniform crossover of trained weight arrays from both parents.

### 7. Mutation

**Structural mutation** (`mutation.ts`): Perturbs:

- Neuron counts per layer (Gaussian noise rounded to integer)
- Activation functions (random swap from pool)
- Connection types, bias types
- RL hyperparameters (gamma, learningRate, epsilon\*)
- Layer add/remove, neuron add/remove
- Mutation parameters themselves (self-adaptive sigma, rate)

**Weight-level mutation** (`evolution-engine.ts`): Gaussian perturbation of trained weights.

### 8. Adaptive Control

`adaptGAControl` adjusts GA meta-parameters based on stagnation and improvement:

| Condition       | Adjustment                              |
| --------------- | --------------------------------------- |
| Stagnation > 5  | Increase population size (up to 80)     |
| Improving       | Decrease population size (down to 8)    |
| Stagnation > 8  | Increase elitism (up to 0.3)            |
| Improving       | Decrease elitism (down to 0.05)         |
| Stagnation > 10 | Increase survivor fraction (up to 0.9)  |
| Stagnation > 6  | More episodes per individual (up to 10) |

### 9. Termination Check

Loop exits when any condition is met (checked each generation):

- `rewardThreshold` reached
- `stagnationPatience` exceeded
- `maxGenerations` reached
- `timeBudgetMs` exhausted

---

## Genetic Operators Reference

### Mutation Distributions (`noise.ts`)

| Distribution | PDF                | Use case                  |
| ------------ | ------------------ | ------------------------- |
| **Gaussian** | `N(0, σ²)`         | Fine-grained local search |
| **Lévy**     | Heavy-tailed α=0.5 | Escaping local optima     |
| **Cauchy**   | Heavy-tailed       | Rare large jumps          |
| **Uniform**  | `U(−σ, σ)`         | Uniform exploration       |

### Sigma Adaptation (`mutation.ts:53-69`)

| Strategy         | Behavior                             |
| ---------------- | ------------------------------------ |
| `fixed`          | Constant sigma                       |
| `sigma_adaptive` | `sigma * (0.9 + 0.2 * random)`       |
| `self_adaptive`  | Log-normal perturbation via 1/5-rule |
| `cma`            | External CMA-ES step-size control    |

### Crossover Types (`crossover.ts`)

| Type           | Formula                          | Use case                   |
| -------------- | -------------------------------- | -------------------------- |
| **Uniform**    | Randomly pick from either parent | Topology mixing            |
| **Arithmetic** | `lerp(a, b, α)`                  | Smooth blending            |
| **BLX-α**      | `U(min-α·d, max+α·d)`            | Extended range exploration |
| **SBX**        | Simulated Binary Crossover       | Real-valued optimization   |

---

## Fitness Computation (`evaluation-utils.ts`, ADR-0025)

Fitness reads the **wallet PnL** of the validation pass, never the shaped reward. `computeFitness(type, pnl)` takes the final PnL of each episode and the PnL change of every validation bar (the curve). The type is the run setting `TRAINER_FITNESS_TYPE` (default `total_pnl`), copied into every genome's `gaControl.fitnessType` and never mutated.

| Type        | Formula (on)                                  | When to use                |
| ----------- | --------------------------------------------- | -------------------------- |
| `total_pnl` | `mean(episode PnL)`                           | Simple profit maximization |
| `sharpe`    | `mean / std` (bar curve)                      | Risk-adjusted returns      |
| `sortino`   | `mean / downside deviation` (bar curve)       | Downside-risk focus        |
| `calmar`    | `mean / max drawdown` (bar curve)             | Drawdown-averse            |
| `composite` | `0.4·mean + 0.3·sharpe + 0.3·sortino` (curve) | Balanced                   |

Ratios are `mean / max(denominator, 0.1 x |mean|)` (0 when the mean is 0): continuous, and a constant, loss-free or drawdown-free series scores 10, the order of a good realistic ratio (0.5 to 3). The floor is relative, so realistic series of any scale keep `mean / denominator` (issue #536). `composite` squashes each term with `tanh` so PnL units and dimensionless ratios weigh comparably.

**Final fitness** applies a complexity penalty: `adjusted = fitness - |fitness| * 0.15 * complexity_penalty` (lower whatever the sign). A failed evaluation scores `-1e9`.

The scalar fitness drives parent selection, stagnation, the reward threshold and the published genome: the Pareto-front member with the highest fitness (`ParetoArchive.best()`). NSGA-II keeps ranking on the objectives `avgPnl` (mean episode PnL), `sharpe` (bar curve) and `negFlops`.

---

## Vector Encoding (`encoding.ts`)

Genomes can be encoded as fixed-length `Float32Array` vectors for use with CMA-ES or vectorized GA implementations:

- 23 scalar fields (RL params, mutation params, input/output dims, depth)
- Per-layer: neuron count + one-hot activation + one-hot connection type
- Zero-padded to handle variable-depth architectures
- Total dimension: `23 + 12 * (1 + 8 + 3) = 167`

---

## Public API (`index.ts`)

The barrel export exposes:

```typescript
// Core
import { GeneticAlgorithmRunner, makeTradingAgentBackend } from './ga-runner';
import { createDefaultGenome } from './factory';

// Operators
import { mutateGenome } from './mutation';
import { crossoverGenomes } from './crossover';
import { selectParent } from './selection';

// Evaluation
import { evaluateGenomeAllWindows, pooledEval } from './evaluation-pipeline';

// Fitness and reward shaping
import { computeFitness } from './evaluation-utils';
import { RewardShaper } from './reward-shaping';
import { trainPhase } from './training-phase';

// Multi-objective
import { ParetoArchive, dominates } from './pareto-engine';

// Diversity
import { genomicDistance, speciate, diversityMetrics } from './diversity';

// Encoding
import { encodeGenome, decodeGenome } from './encoding';

// Validation
import { validateGenome, repairGenome } from './validation';

// Complexity
import { estimateComplexity } from './complexity-estimator';

// Adaptive control
import { adaptGAControl, checkTerminationConditions } from './adaptive-control-system';
```
