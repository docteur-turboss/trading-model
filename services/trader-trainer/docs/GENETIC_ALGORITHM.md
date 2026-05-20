# Genetic Algorithm Module

## Overview

The GA module (`src/core/genetic-algorithm/`) implements a **self-adaptive, multi-objective genetic algorithm** with Lamarckian weight inheritance. It evolves populations of trading agents by optimizing both network architecture and RL hyperparameters simultaneously.

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

Controls Q-learning behavior:

| Sub-module         | Key fields                                 | Purpose                 |
| ------------------ | ------------------------------------------ | ----------------------- |
| `rewardShaping`    | clip, scale, normalize, sparse             | Reward preprocessing    |
| `horizon`          | maxEpisodeLength, nStepReturn, frameSkip   | Episode structure       |
| `discretePolicy`   | epsilonStart, epsilonMin, epsilonDecay     | Exploration schedule    |
| `continuousPolicy` | noiseStd, noiseDecay                       | Continuous action noise |
| `replayBuffer`     | bufferSize, prioritized, alphaPER, betaPER | Experience replay       |

### Default Configuration

Defined in `factory.ts`. Key defaults:

- 2 hidden layers: [64, 32] with ReLU activation
- Epsilon-greedy: start=1.0, min=0.05, decay=0.995
- Replay buffer: 10,000 experiences
- Population: 20 individuals, 50 max generations
- Mutation rate: 0.1, sigma: 0.05

---

## GA Loop (Generation Cycle)

Each generation follows this sequence in `GeneticAlgorithmRunner.runGeneration()`:

### 1. Evaluation Phase (`evaluateGenomeAllWindows`)

For each genome in the population:

1. **Shadow pass**: Create a temporary backend, run through training data to pre-compute rewards
2. **Training pass**: Create a fresh backend, run Q-learning using pre-computed rewards with n-step TD targets
3. **Lamarckian update**: Extract trained weights, freeze them into the genome
4. **Validation pass**: Create a fresh backend with Lamarckian weights, evaluate on held-out validation data
5. **Scoring**: Compute fitness from episode returns, apply complexity penalty

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

## Fitness Computation (`fitness.ts`)

| Type        | Formula                              | When to use                |
| ----------- | ------------------------------------ | -------------------------- |
| `total_pnl` | `mean(rewards)`                      | Simple profit maximization |
| `sharpe`    | `mean / std`                         | Risk-adjusted returns      |
| `sortino`   | `mean / downside_std`                | Downside-risk focus        |
| `calmar`    | `mean / max_drawdown`                | Drawdown-averse            |
| `composite` | `0.4·pnl + 0.3·sharpe + 0.3·sortino` | Balanced                   |

**Final fitness** applies a complexity penalty: `adjusted = fitness * (1 - 0.15 * complexity_penalty)`

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

// Fitness
import { computeFitness, shapeReward } from './fitness';

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
