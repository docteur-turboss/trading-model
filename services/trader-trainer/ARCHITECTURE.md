# Trader-Trainer Architecture

## Overview

**Trader-Trainer** is a microservice that autonomously trains trading AI agents using a **Genetic Algorithm (GA) + Deep Q-Learning** approach. It receives real market data from the **Message Manager** service and prepares the best-performing agent from each training session as a versioned model export (ADR-0022). No executor service exists yet.

### Key Responsibilities

1. **Agent Evolution**: Continuously improve agents through genetic algorithm and Q-learning
2. **Data Integration**: Consume real market data from Message Manager service
3. **Performance Evaluation**: Calculate fitness metrics (Sharpe, Sortino, Calmar, PnL)
4. **Memory Optimization**: Dynamically allocate population size based on available physical memory
5. **Agent Export**: Publish versioned model artifacts (`GET /v1/trader-trainer/models/:symbol/:version`) and the best-agent summary (`GET /v1/trader-trainer/best-agent`)

### Why This Approach

| Challenge | Solution |
| --------- | -------- |
| Trading is a high-dimensional sequential decision problem | Deep Q-Learning handles state-action value approximation |
| Optimal architecture (layers, neurons, activations) is unknown | GA searches the topology space automatically |
| RL hyperparameters (lr, gamma, epsilon decay) are hard to tune | GA mutates/crossovers them alongside architecture |
| Single training run may produce brittle agents | Population-based evolution with Pareto archive preserves diverse solutions |
| Overfitting to recent market conditions | Walk-forward validation on held-out windows |

---

### Termination Conditions

The GA loop stops when **any** of these conditions is met (checked in order):

1. `bestFitness >= rewardThreshold` — target fitness reached
2. `stagnation >= stagnationPatience` — no improvement for N generations
3. `generation >= maxGenerations` — max generations reached
4. `elapsedMs >= timeBudgetMs` — time budget exhausted

---

### Service Dependencies

**Financial Scraper**: candle window read over HTTP at each session (ADR-0044); the trainer subscribes to no bus topic (ADR-0078). **Message Manager** (`@trading-model/broker-message`): only used to publish models.

**Address Manager** (`@trading-model/address-manager`): Resolves the DNS name of the other services and serves `/ping`, `/status`, `/metrics`.

**Model consumers** (output): the best agent is exposed via `/best-agent`; versioned artifacts via `/models/:symbol` and `/models/:symbol/:version` (ADR-0022). No Trader-Executor service exists (future, not implemented).

---

### Health Checks

- **Service ping**: Address manager pings each instance to verify liveness
- **`/ping` endpoint**: Returns 200 when service is alive
- **`/training-status` endpoint**: Shows if training is active, on which symbol, and current generation

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
        ↓ Best agent + versioned model export (ADR-0022)
```

---

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
│   │   ├── market-data-buffer.ts      # Per-symbol rolling windows (onDataAdded hook)
│   │   ├── training-settings.ts       # Hyper-parameters resolved by the composition root
│   │   └── ports/model-publisher.port.ts
│   ├── application/
│   │   ├── index.ts                   # Entry point: bootstrap, bus subscriptions, training loop
│   │   ├── server.ts                  # Express server + admin training routes
│   │   ├── trainer.ts                 # Training lifecycle per symbol, publication, metrics
│   │   └── training-session.ts        # One GA run with the injected settings and telemetry
│   ├── adapters/
│   │   ├── inbound/events/            # Market-data bus event handlers and processors
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

---

## Core Modules

### 1. **application/** - Service Entry Point & Orchestration

- **index.ts**: Initializes the service, binds to port, handles graceful shutdown
- **server.ts**: Configures Express with security middleware (Helmet), health checks (/ping)

**Dependencies**: `express`, `helmet`, `cash-lib` (error handling)

---

### 2. **domain/agent/** - Trading Agent Orchestration

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
- Action mapping (epsilon-greedy over sell / hold / buy)
- Replay buffer and minibatch Q-learning updates (`remember`, `replay`)

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

### 3. **domain/env/** - Trading Environment

#### WalletManager

Simulates a trading account with realistic constraints:

```typescript
interface Wallet {
  buy(amount: number): boolean; // Execute buy order
  sell(amount: number): boolean; // Execute sell order
  getPnL(): number; // Unrealized PnL
  getValuation(): number; // Total account value
  setPrice(price: number): void; // Update market price
}
```

**Features**:

- Realistic position management
- Transaction fee simulation
- Max position limits
- P&L calculation (realized + unrealized)

**Trade Execution Logic**:

```
Buy:  cash -= amount * price + fees; position += amount
Sell: cash += amount * price - fees; position -= amount
```

---

### 4. **domain/neural-network/** - Deep Q-Learning Agent

See [Neural Network — Reference](../../docs/reference/neural-network.md).

### 5. **domain/genetic-algorithm/** - Evolution Engine

See [Genetic Algorithm — Reference](../../docs/reference/genetic-algorithm.md): genome, operators, NSGA-II, fitness (ADR-0025), adaptive control.

---

## Training Loop

See [Training Process — Reference](../../docs/reference/training-process.md).

---

## Key Design Decisions

### 1. Lamarckian Evolution (Weight Inheritance)

After each evaluation window, trained neural network weights are **frozen back** into the genome (`trainedWeights`). Offspring inherit these weights (via crossover + mutation), so each generation builds on the knowledge of the previous one rather than starting from scratch.

**File**: `ga-runner.ts` (`lamarckianUpdate`)

### 2. Walk-Forward Validation

Each symbol's market data is split into `train` (80%) and `validation` (20%) windows. The agent learns on `train` data via Q-learning, but fitness is computed **only on `validation` data** — guaranteeing out-of-sample evaluation.

**File**: `ga-runner.ts` (`WindowSet` type)

### 3. NSGA-II Multi-Objective Optimization

Three competing objectives are optimized simultaneously: **avgPnl** (maximize), **sharpe** (maximize), **negFlops** (minimize complexity). Non-dominated sorting preserves solutions that excel in different trade-offs. A persistent `ParetoArchive` keeps the best solutions across generations.

**File**: `pareto-engine.ts`

### 4. Self-Adaptive GA Control

GA meta-parameters (population size, elitism fraction, episodes per individual, kept within 10–30) are **themselves evolved** during training. The `adaptGAControl` function adjusts them based on stagnation and improvement history.

**File**: `adaptive-control-system.ts`

### 5. Immutable Genome Architecture

All genome operations produce **new frozen objects** using `deepFreeze`. This eliminates mutation bugs and keeps each evaluation free of shared mutable state.

### 6. Sequential Evaluation

Genomes are evaluated sequentially on the training worker thread (CPU-bound, no parallelism). Each genome creates its own `RLBackend` (TradingAgent), runs Q-learning training, then evaluates on validation data.

**File**: `ga-runner.ts` (`sequentialEval`)

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
GET /v1/trader-trainer/best-agent
GET /v1/trader-trainer/models/:symbol/:version  (ADR-0022)
    ↓
Consumer (none implemented yet)
```

#### Agent Export Format

The best agent summary (available at `/best-agent`) contains all fields needed to reconstruct and deploy:

```typescript
const agent = new TradingAgent({
  nnConfig: {
    neuronsByLayer: [
      summary.network.inputDim,
      ...summary.network.hiddenLayers.map(l => l.neurons),
      summary.network.outputDim,
    ],
    activationFunctions: summary.network.hiddenLayers.map(l => l.activation),
  },
  wallet: { initialCash: 1000, initialPrice: 1, feeRate: 0.001, executionCostRate: 0.0005 },
  actionSpace: 'discrete',
  tradeAmount: 1,
  stateManagerCfg: {
    epsilonStart: summary.rl.epsilonStart,
    epsilonMin: summary.rl.epsilonMin,
    epsilonDecay: summary.rl.epsilonDecay,
    gamma: summary.rl.gamma,
  },
});
```

For complete agent reconstruction (with trained weights), the `trainedWeights` field would need to be exported — this is currently internal but can be added to the API response.

#### Adding New Market Data Sources

To consume additional market data:

1. Add event type to imports in `application/index.ts`
2. Subscribe in the `onStart` handler
3. Add to `MessageManager.intents()` array
4. Process data in `MarketDataBuffer` (add new normalizer if needed)
5. Add feature dimension in `buildFeatures()` if new data is used as input

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
  'sigmoid' | 'tanh' | 'relu' | 'gelu' | 'elu' | 'mish' | 'leakyReLu' | 'linear';

// Connection types
type ConnectionType = 'fully-connected' | 'dense-skip' | 'residual-connection';

// Initializers
type InitialisationType = 'zeros' | 'lecun' | 'he' | 'xavier' | 'random';

// Normalizations
type NormalisationType = 'minmax' | 'zscore' | 'robust' | 'batch' | 'layer' | 'instance' | 'none';

// Fitness metrics
type FitnessType = 'total_pnl' | 'sharpe' | 'sortino' | 'calmar' | 'composite';

// Selection methods
type SelectionType = 'tournament';
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
- `@biomejs/biome`: Linting and formatting (root)

---

## Code Standards

See [Monorepo Standards](../../docs/standards/README.md) for:

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
