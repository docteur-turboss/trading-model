# Trader-Trainer Architecture

## Overview

**Trader-Trainer** is a microservice that autonomously trains trading AI agents using a **Genetic Algorithm (GA) + Deep Q-Learning** approach. It receives real market data from the **Message Manager** service and prepares the best-performing agent from each training session for deployment to a **Trader-Executor** service.

### Key Responsibilities

1. **Agent Evolution**: Continuously improve agents through genetic algorithm and Q-learning
2. **Data Integration**: Consume real market data from Message Manager service
3. **Performance Evaluation**: Calculate fitness metrics (Sharpe, Sortino, Calmar, PnL)
4. **Memory Optimization**: Dynamically allocate population size based on available physical memory
5. **Agent Export**: Deploy best agents to Trader-Executor via Message Manager library or direct HTTPS

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Trader-Trainer Service                │
├─────────────────────────────────────────────────────────┤
│                                                          │
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
│                                                          │
└─────────────────────────────────────────────────────────┘
            ↓ Real market data from Message Manager
        ↓ Best agent to Trader-Executor
```

---

## Directory Structure

```

```

services/trader-trainer/
├── src/
│ ├── app/
│ │ ├── index.ts # Service entry point
│ │ └── server.ts # Express server setup
│ │
│ └── core/
│ ├── agent/
│ │ ├── trading-agent.ts # Orchestrates NN + Wallet + StateManager
│ │ ├── trading-agent.spec.ts # Unit tests
│ │ ├── state-manager.ts # Q-learning state & epsilon-decay
│ │ ├── state-manager.spec.ts # Unit tests
│ │ └── auto-env.ts # GA-compatible environment wrapper
│ │
│ ├── env/
│ │ ├── wallet-manager.ts # Simulates trading account
│ │ └── wallet-manager.spec.ts # Unit tests
│ │
│ ├── neural-network/
│ │ ├── neural-network.ts # Core NN implementation
│ │ ├── neural-network.spec.ts # Unit tests
│ │ ├── agent.ts # NN + experience replay wrapper
│ │ ├── type.ts # Type definitions
│ │ ├── activation.ts # Activation functions
│ │ ├── initializers.ts # Weight initialization strategies
│ │ ├── optimizer.ts # Optimization algorithms (SGD, Adam, etc.)
│ │ ├── losses.ts # Loss functions (MSE, CE, Huber)
│ │ ├── normalize.ts # Normalization strategies
│ │ └── utils.ts # Utilities
│ │
│ └── genetic-algorithm/
│ ├── ga-runner.ts # Main GA evolution loop with NSGA-II, Lamarckian inheritance, and Pareto archiving
│ ├── genome.ts # Full genome type definitions and validation
│ ├── validation.ts # Re-exports validation from genome.ts (avoids Feature Envy)
│ ├── genome-types.ts # Additional genome type aliases
│ ├── mutation.ts # Adaptive gaussian/levy mutation
│ ├── crossover.ts # Uniform/BLX-α/SBX crossover
│ ├── selection.ts # Tournament, roulette, rank-based
│ ├── evolution-engine.ts # Low-level weight evolution functions
│ ├── fitness.ts # Sharpe, Sortino, Calmar metrics
│ ├── evaluation-pipeline.ts # Multi-window evaluation pipeline
│ ├── complexity-estimator.ts # Complexity penalty & fitness adjustment
│ ├── pareto-engine.ts # NSGA-II exact and approximate sorting
│ ├── adaptive-control-system.ts # Self-adaptive GA parameter control
│ ├── factory.ts # Default genome factory
│ ├── encoding.ts # Genome encode/decode
│ ├── diversity.ts # Speciation and novelty search
│ ├── noise.ts # Noise distributions for mutation
│ ├── prng.ts # Pseudo-random number generator
│ ├── utils.ts # Shared utilities (clamp, generateId, RunningStats)
│ └── index.ts # Barrel exports
│ │
│ ├── Constraints & Validation:
│ │ ├── complexity.ts # Topology constraints
│ │ ├── validation.ts # Genome validation & repair
│ │ └── adaptive_control_system.ts # Adaptive GA parameters
│ │
│ ├── Diversity & Speciation:
│ │ ├── diversity.ts # Speciation & novelty
│ │ └── pareto_engine.ts # Multi-objective optimization
│ │
│ ├── Genome & Encoding:
│ │ ├── genome.ts # Genome structure definition
│ │ ├── genome_types.ts # Type exports
│ │ ├── encoding.ts # Genome vectorization
│ │ └── factory.ts # Default genome creation
│ │
│ └── Infrastructure:
│ ├── prng.ts # Seeded random number generator
│ ├── noise.ts # Gaussian, Levy, Cauchy distributions
│ ├── utils.ts # Clamp, generateId
│ └── index.ts # Public API barrel export
│
├── docs/ # Technical documentation
│ ├── GENETIC_ALGORITHM.md
│ ├── NEURAL_NETWORK.md
│ ├── TRAINING_PROCESS.md
│ ├── API.md
│ └── INTEGRATION.md
│
├── package.json # Dependencies
├── tsconfig.json # TypeScript config
├── jest.config.js # Jest testing config
├── eslint.config.js # ESLint rules
├── ARCHITECTURE.md # This file
└── README.md # User guide

````

---

## Core Modules

### 1. **app/** - Service Entry Point

- **index.ts**: Initializes the service, binds to port, handles graceful shutdown
- **server.ts**: Configures Express with security middleware (Helmet), health checks (/ping)

**Dependencies**: `express`, `helmet`, `cash-lib` (error handling)

---

### 2. **core/agent/** - Trading Agent Orchestration

#### TradingAgent

Combines Neural Network, Wallet, and StateManager into a single unified interface.

```typescript
public step(input: Float32Array, price?: number, done: boolean = false): {
  action: string,
  reward: number,
  metrics: any
}
````

**Key Methods**:

- `mapOutputToAction()`: Converts network output [0..1] to trading action (buy/sell/hold)
- `step()`: Executes one environment step with reward calculation

**Responsibilities**:

- Network inference
- Wallet state updates
- Reward shaping based on P&L
- Action mapping (discrete or continuous)

#### StateManager

Manages Q-learning hyperparameters and exploration-exploitation trade-off.

**Key Methods**:

- `getEpsilon()`, `decayEpsilon()`: Epsilon-greedy exploration
- `getGamma()`, `getLearningRate()`: RL hyperparams
- `updateFromGenome()`: Load RL parameters from genome

**Responsibilities**:

- Epsilon decay schedule
- Hyperparameter storage
- Episode lifecycle management

#### AutoEnv

Lightweight wrapper enabling GA runners to interface with TradingAgent without tight coupling.

---

### 3. **core/env/** - Trading Environment

#### WalletManager

Simulates a trading account with realistic constraints:

```typescript
interface Wallet {
  buy(amount: number): boolean; // Execute buy order
  sell(amount: number): boolean; // Execute sell order
  getPnL(): number; // Unrealized PnL
  getValuation(): number; // Total account value
  getMetrics(): WalletMetrics; // Performance metrics
  setPrice(price: number): void; // Update market price
}
```

**Features**:

- Realistic position management
- Transaction fee simulation
- Max position limits
- P&L calculation (realized + unrealized)
- Sharpe/Sortino/Calmar metrics
- Drawdown tracking

**Trade Execution Logic**:

```
Buy:  cash -= amount * price + fees; position += amount
Sell: cash += amount * price - fees; position -= amount
```

---

### 4. **core/neural_network/** - Deep Q-Learning Agent

#### NeuralNetwork

Fully-connected feedforward network with configurable:

- **Layers**: Input → Hidden Layers... → Output
- **Activations**: ReLU, Tanh, Sigmoid, GELU, Softmax, ELU, Mish, LeakyReLU
- **Optimizers**: SGD, Adam, RMSProp
- **Loss Functions**: MSE, Cross-Entropy, Huber, Smooth L1
- **Normalizations**: MinMax, Z-score, Robust, Batch Norm, Layer Norm

**Forward Pass**:

```
output = activation(weight @ input + bias)
```

**Backward Propagation**:

- Gradient computation via chain rule
- Weight updates using optimizer (SGD, Adam)
- Support for batch training

#### Agent

Wraps NeuralNetwork with:

- **Experience Replay Pool**: Stores (state, action, reward, next_state, done) tuples
- **Q-Learning Updates**: Applies Bellman equation
- **Fast Inference**: Optimized forward pass for trading

**Experience Storage**:

```typescript
interface Experience {
  state: Float32Array;
  action: number;
  reward: number;
  nextState: Float32Array;
  done: boolean;
}
```

---

### 5. **core/genetic_algorithm/** - Evolution Engine

#### GeneticAlgorithmRunner

Main evolution loop orchestrating:

1. **Initialization**: Create initial population of random genomes
2. **Evaluation**: Each genome → TradingAgent → fitness score
3. **Selection**: Choose parents via tournament/roulette
4. **Genetic Operators**:
   - **Mutation**: Gaussian, Lévy, Cauchy, Uniform perturbations
   - **Crossover**: Uniform, Arithmetic, BLX-α, SBX
5. **Environmental Selection**: Keep best + maintain diversity
6. **Termination**: Check convergence, generation limit, diversity

**Population Dynamics**:

- Size adapts to available memory
- Penalizes computational complexity
- Maintains speciation via distance metrics
- Archives Pareto-optimal solutions

#### Genome Structure

```typescript
interface Genome {
  network: {
    inputDim: number;
    outputDim: number;
    hiddenLayers: Array<{
      neurons: number;
      activation: ActivationType;
      connectionType: ConnectionType;
      normalization: NormalisationType;
    }>;
  };
  rl: {
    discretePolicy: {
      learningRate: number;
      gamma: number;
      epsilon: number;
      epsilonDecay: number;
    };
    replayBuffer: {
      bufferSize: number;
      batchSize: number;
    };
  };
  mutation: {
    distribution: MutationDistribution;
    sigma: number;
    adaptiveRate: number;
  };
  crossover: {
    type: CrossoverType;
    blxAlpha: number;
  };
}
```

#### Key Operators

**Mutation**:

- Per-layer adaptive sigma adjustment
- Multiple distributions (Gaussian, Lévy)
- Hyperparameter mutation capability
- Complexity penalty on mutation strength

**Crossover**:

- Uniform: randomly blend parent alleles
- Arithmetic: weighted average of weights
- BLX-α: blend in extended range
- SBX: Simulated Binary Crossover

**Fitness Calculation**:

```
fitness = α * sharpe_ratio + β * pnl - γ * complexity_penalty
```

**Metrics**:

- Total P&L
- Sharpe Ratio
- Sortino Ratio (downside risk)
- Calmar Ratio
- Max Drawdown
- Win Rate

#### Adaptive Control

Automatically adjusts:

- Mutation rate based on population diversity
- Crossover rate based on convergence
- Population size based on available memory
- Termination conditions (stagnation, diversity loss)

---

## Training Loop

```
Initialize population P = [G₁, G₂, ..., Gₙ]

for generation t = 1 to max_generations:

  for each genome Gᵢ in P:
    agent = create_agent_from(Gᵢ)

    for each market window w:
      for each price sample (price, features):
        reward = agent.step(features, price)

      evaluate agent on returns

    fitness[i] = compute_fitness(returns, metrics)

  # Environmental selection
  elite = keep_best_k(P, fitness, k=0.1*n)

  # Reproduction
  offspring = []
  while len(offspring) < n - k:
    parent1 = select(P, fitness)
    parent2 = select(P, fitness)

    child = crossover(parent1, parent2)
    child = mutate(child)
    child = repair_if_invalid(child)

    offspring.append(child)

  P = elite + offspring

  # Adaptive control
  mutation_rate = adapt_mutation(diversity)
  crossover_rate = adapt_crossover(convergence)

  if termination_condition_met(P, fitness):
    break

return best_genome_from(P)
```

---

## Integration with Microservices

### Input: Real Market Data

```
Message Manager Service
    ↓
[Market events: price, volume, indicators]
    ↓
Trader-Trainer (consume via cash-lib)
    ↓
Agent training on real data
```

### Output: Best Agent

```
Trader-Trainer (best agent)
    ↓
Message Manager Library
    ↓
HTTP (secured) or Message Queue
    ↓
Trader-Executor Service
    ↓
Live trading execution
```

---

## Memory Management

The system dynamically allocates population size:

```typescript
function calculateMaxPopulation(): number {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const availableMemory = freeMemory * 0.8; // Use 80% to be safe

  const memoryPerGenome = 2.5 * 1024 * 1024; // ~2.5 MB per agent
  const maxPopulation = Math.floor(availableMemory / memoryPerGenome);

  return Math.max(10, Math.min(maxPopulation, 500)); // 10-500 agents
}
```

---

## Performance Metrics

| Metric            | Formula                     | Interpretation                  |
| ----------------- | --------------------------- | ------------------------------- |
| **P&L**           | Final Value - Initial Value | Absolute profit/loss            |
| **Return**        | P&L / Initial Value         | Percentage return               |
| **Sharpe Ratio**  | (Return - Rf) / σ_returns   | Risk-adjusted return            |
| **Sortino Ratio** | Return / σ_downside         | Focuses on downside risk        |
| **Calmar Ratio**  | Return / max_drawdown       | Return per unit of max loss     |
| **Max Drawdown**  | min(drawdown%)              | Largest peak-to-trough decline  |
| **Win Rate**      | wins / total_trades         | Percentage of profitable trades |

---

## Type System

```typescript
// Activation functions
type ActivationType =
  | 'sigmoid'
  | 'tanh'
  | 'relu'
  | 'gelu'
  | 'softmax'
  | 'elu'
  | 'mish'
  | 'leakyRelu';

// Connection types
type ConnectionType = 'fully-connected' | 'dense-skip' | 'residual-connection';

// Initializers
type InitialisationType = 'zeros' | 'lecun' | 'he' | 'xavier' | 'random';

// Normalizations
type NormalisationType = 'minmax' | 'zscore' | 'robust' | 'batch' | 'layer' | 'instance' | 'none';

// Optimizers
type OptimizerType = 'sgd' | 'adam' | 'rmsprop';

// Fitness metrics
type FitnessType = 'total_pnl' | 'sharpe' | 'sortino' | 'calmar' | 'composite';

// Mutation distributions
type MutationDistribution = 'gaussian' | 'levy' | 'cauchy' | 'uniform';

// Selection methods
type SelectionType = 'tournament' | 'roulette' | 'rank' | 'sus';
```

---

## Dependencies

**Production**:

- `express@^5.2.1`: HTTP server
- `helmet@^8.1.0`: Security middleware
- `cash-lib`: Common middleware & utilities

**Development**:

- `typescript@~6.0.3`: Language
- `jest@^30.4.2`: Testing
- `ts-jest@^29.4.9`: TypeScript support for Jest
- `eslint@^10.3.0`: Linting

---

## Code Standards

See [CODE_OF_CONDUCT.md](../../docs/CODE_OF_CONDUCT.md) for:

- Naming conventions
- File organization
- JSDoc documentation
- Error handling
- Testing requirements
- Performance guidelines

---

## Future Improvements

1. **Distributed Training**: Split population across multiple machines
2. **Transfer Learning**: Pre-train agents on historical data
3. **Multi-Asset**: Evolve agents for multiple trading pairs simultaneously
4. **Ensemble Methods**: Combine multiple agents for robust decisions
5. **Real-time Adaptation**: Update agent weights without full retraining
6. **Advanced Selection**: NSGA-III for many-objective optimization

---

## References

- Genetic Algorithms: Holland (1975), Goldberg (1989)
- Q-Learning: Watkins & Dayan (1992)
- Sharpe Ratio: Sharpe (1966)
- Fitness Shaping: Ng & Russell (1999)
