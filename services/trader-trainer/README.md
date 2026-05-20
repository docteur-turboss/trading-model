# Trader-Trainer Service

> Autonomous trading AI agents trained via **Genetic Algorithm + Deep Q-Learning**

## Overview

Trader-Trainer is a microservice that evolves a population of neural network-based trading agents using genetic algorithms and deep reinforcement learning. It consumes real market data from the **Message Manager** service and produces optimized trading agents ready for deployment to **Trader-Executor**.

**Key Features**:

- 🧬 **Genetic Algorithm Evolution**: Self-improving population of agents
- 🤖 **Deep Q-Learning**: Neural network agents with experience replay
- 📊 **Real Market Data**: Trains on actual price feeds from Message Manager
- 💾 **Memory-Aware**: Dynamically scales population based on available memory
- ⚡ **Adaptive Control**: Automatically adjusts mutation/crossover rates
- 🏆 **Multi-Objective**: Optimizes for Sharpe, Sortino, Calmar, and P&L simultaneously
- 🔒 **Secure Export**: Sends best agents to Trader-Executor via secured channels

## Quick Start

### Installation

```bash
cd services/Trader-Trainer
npm install
```

### Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Build
npm run build
```

### Environment Variables

```env
PORT=3001                    # Service port (default: 3000)
LOG_LEVEL=info              # Logging level
MESSAGE_MANAGER_URL=...     # Message Manager service URL
TRADER_EXECUTOR_URL=...     # Trader-Executor service URL
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture, module breakdown, and integration patterns.

### High-Level Flow

```
Real Market Data (Price, Volume, Indicators)
            ↓
[Trader-Trainer Microservice]
    ├─ Genetic Algorithm (Population Evolution)
    ├─ Neural Network Agents (Q-Learning)
    ├─ Trading Wallet Simulation
    └─ Fitness Evaluation (Sharpe, Sortino, etc.)
            ↓
Best Agent (with Risk Score)
            ↓
Trader-Executor Service (Live Trading)
```

## Project Structure

```
src/
├── app/                              # Service entry point
│   ├── index.ts                     # Initialization & shutdown
│   └── server.ts                    # Express configuration
│
└── core/
    ├── agent/                       # Trading agent orchestration
    │   ├── trading_agent.ts
    │   ├── state_manager.ts
    │   └── auto_env.ts
    │
    ├── env/                         # Trading environment
    │   └── wallet-manager.ts        # Account simulation
    │
    ├── neural_network/              # Deep Q-Learning agent
    │   ├── neural-network.ts
    │   ├── agent.ts                 # NN + experience replay
    │   ├── activation.ts
    │   ├── optimizer.ts
    │   └── ...
    │
    └── genetic_algorithm/           # Evolution engine
        ├── ga_runner.ts             # Main GA loop
        ├── mutation.ts              # Adaptive mutation
        ├── crossover.ts             # Genome crossover
        ├── fitness.ts               # Fitness calculation
        ├── validation.ts            # Genome validation
        └── ...
```

## Usage

### Creating and Training Agents

```typescript
import GeneticAlgorithmRunner from './core/genetic_algorithm/ga_runner';

// Initialize GA runner
const gaRunner = new GeneticAlgorithmRunner({
  populationSize: 50,
  generations: 100,
  mutationRate: 0.2,
  crossoverRate: 0.8,
  elitismRate: 0.1,
  timeWindowSize: 100,
  marketData: priceHistoryArray,
});

// Run evolution
const bestAgent = await gaRunner.run();

// Export for deployment
const agentJson = bestAgent.toJSON();
sendToTraderExecutor(agentJson);
```

### Trading Agent Inference

```typescript
import TradingAgent from './core/agent/trading_agent';

const agent = new TradingAgent({
  nnConfig: {
    neuronsByLayer: [10, 32, 16, 3],
    activationFunctions: ['relu', 'relu'],
    optimizationType: 'adam',
    learningRate: 0.001,
  },
  wallet: { initialCash: 10000, initialPrice: 100 },
  actionSpace: 'discrete',
  tradeAmount: 1,
});

// Execute one trading step
const { action, reward, metrics } = agent.step(
  marketFeatures, // Float32Array of normalized indicators
  currentPrice, // Current market price
  isEpisodeDone // Episode termination flag
);

// Actions: 'buy' | 'sell' | 'hold'
```

### Manual Agent Evaluation

```typescript
import { evaluateGenomeAllWindows } from './core/genetic_algorithm/evaluation_pipeline';

const fitness = await evaluateGenomeAllWindows(
  genome, // Agent genome
  marketData, // Historical prices
  timeWindows, // Training periods
  backendFactory // TradingAgent factory function
);

console.log(`Fitness Score: ${fitness.totalFitness}`);
console.log(`Sharpe Ratio: ${fitness.sharpe}`);
console.log(`Win Rate: ${fitness.winRate}`);
```

## API Endpoints

### Health Check

```http
GET /ping
```

Returns service status.

### [Future] Agent Endpoints

- `POST /agents/evaluate` - Evaluate agent on data
- `POST /agents/export` - Export best agent
- `GET /agents/metrics` - Training metrics
- `POST /agents/train` - Start training session

## Testing

Comprehensive unit tests for all modules:

```bash
# Run all tests
npm test

# Run specific module tests
npm test -- ga.spec
npm test -- trading_agent.spec
npm test -- neural-network.spec
npm test -- wallet-manager.test

# With coverage
npm test -- --coverage
```

### Test Coverage

- ✅ **Genetic Algorithm**: Mutation, crossover, fitness, validation
- ✅ **Neural Network**: Forward pass, backward prop, activations
- ✅ **Trading Agent**: Action mapping, step execution, reward calculation
- ✅ **Wallet Manager**: Buy/sell, P&L, metrics calculation
- ✅ **State Manager**: Epsilon decay, hyperparameters

## Configuration

### Neural Network Configuration

```typescript
interface NeuralNetworkConfig {
  // Architecture
  neuronsByLayer: number[]; // [input, hidden1, hidden2, ..., output]
  activationFunctions: ActivationType[]; // Per hidden layer
  connectionTypes: ConnectionType[]; // Fully-connected, skip, residual
  biasTypes: BiasType[]; // Enabled/disabled

  // Normalization
  normalization: NormalisationType; // MinMax, Z-score, Batch, etc.

  // Training
  optimizationType: OptimizerType; // SGD, Adam, RMSProp
  learningRate: number; // Typical: 0.001-0.01
  lossFunction: LossFunctionType; // MSE, CE, Huber

  // Experience Replay
  enablePool: boolean;
  poolMaxSize: number;
}
```

### Genetic Algorithm Configuration

```typescript
interface GARunnerConfig {
  // Population
  populationSize: number; // 20-500 (auto-scaled by memory)
  generations: number; // Termination condition
  elitismRate: number; // Proportion kept (0.05-0.2)

  // Genetic Operators
  mutationRate: number; // 0.1-0.5
  crossoverRate: number; // 0.6-0.9

  // Selection
  selectionType: SelectionType; // Tournament, roulette
  tournamentSize: number; // 2-5

  // Data
  marketData: MarketStep[]; // Historical price data
  timeWindowSize: number; // Evaluation window (candles)
  validationSplit: number; // 0.7-0.8

  // Constraints
  maxLayers: number; // Max hidden layers
  maxNeuronsPerLayer: number; // Max neurons
  maxConnections: number; // Network complexity limit

  // Termination
  stagnationGenerations: number; // Generations without improvement
  targetFitness: number; // Stop if fitness reached
  diversityThreshold: number; // Stop if diversity too low
}
```

## Fitness Metrics

Agents are evaluated on multiple dimensions:

| Metric            | Calculation                   | Interpretation              |
| ----------------- | ----------------------------- | --------------------------- |
| **Total P&L**     | Final Value - Initial Value   | Absolute profit             |
| **Return %**      | P&L / Initial Value           | Percentage profit           |
| **Sharpe Ratio**  | (avg_return - rf) / std_dev   | Risk-adjusted return        |
| **Sortino Ratio** | avg_return / downside_std     | Downside-risk adjusted      |
| **Calmar Ratio**  | avg_return / max_drawdown     | Return per unit of max loss |
| **Max Drawdown**  | peak_to_trough decline        | Largest loss from peak      |
| **Win Rate**      | winning_trades / total_trades | % of profitable trades      |

**Composite Fitness**:

```
fitness = 0.4 * sharpe + 0.3 * sortino + 0.2 * pnl - 0.1 * complexity_penalty
```

## Genetic Algorithm Details

### Population Evolution

1. **Selection**: Tournament or roulette based on fitness
2. **Crossover**: Blend parent genomes (uniform, arithmetic, BLX-α)
3. **Mutation**: Adaptive gaussian/lévy perturbations
4. **Validation**: Check topology constraints, repair if needed
5. **Evaluation**: Run TradingAgent on market data
6. **Environmental Selection**: Keep elite + best offspring
7. **Termination**: Check convergence, stagnation, diversity

### Mutation Operators

- **Gaussian**: Standard deviation from parent
- **Lévy**: Long-tailed distribution for exploration
- **Cauchy**: Heavy-tailed for rare events
- **Uniform**: Random within range
- **Adaptive**: Sigma adjusted based on diversity

### Crossover Types

- **Uniform**: Randomly select alleles from each parent
- **Arithmetic**: Weighted average of parents
- **BLX-α**: Blend in extended range [min-α*range, max+α*range]
- **SBX**: Simulated Binary Crossover

## Integration with Message Manager

### Receiving Market Data

```typescript
import { MessageManagerClient } from 'cash-lib/broker-message';

const client = new MessageManagerClient(config);

client.on('market_update', (data: MarketData) => {
  // Process: price, volume, indicators
  gaRunner.feedMarketData(data);
});

client.on('episode_end', async () => {
  // Evaluate and prepare best agent
  const bestAgent = await gaRunner.getBestAgent();
  await client.sendAgent(bestAgent, { pair: 'BTC/USDT', riskScore: 0.3 });
});
```

### Exporting Best Agent

```typescript
// Send to Trader-Executor
const agent = gaRunner.bestGenome.toTradeableAgent();

const payload = {
  agent: agent.serialize(),
  metrics: {
    sharpeRatio: 1.85,
    sortinoRatio: 2.3,
    winRate: 0.62,
    maxDrawdown: 0.08,
  },
  pair: 'BTC/USDT',
  riskScore: 0.35, // 0 = conservative, 1 = aggressive
  timestamp: Date.now(),
};

// Via Message Manager service
await messageManager.publish('trader-executor-agents', payload);

// Or direct HTTPS (with authentication via cash-lib)
await axios.post('https://trader-executor:3002/agents/deploy', payload, {
  headers: await getSecureHeaders(),
});
```

## Performance Tuning

### For Faster Training

```typescript
{
  populationSize: 20,           // Smaller population
  generations: 50,              // Fewer generations
  timeWindowSize: 50,           // Shorter evaluation windows
  mutationRate: 0.5,            // Higher exploration
  validationSplit: 0.6,         // Less validation data
}
```

### For Better Results

```typescript
{
  populationSize: 100,          // Larger population
  generations: 200,             // More generations
  timeWindowSize: 200,          // Longer evaluation windows
  elitismRate: 0.2,             // Stronger elitism
  validationSplit: 0.8,         // More validation data
  stagnationGenerations: 30,    // Patience for plateaus
}
```

### Memory Optimization

```typescript
// Automatic population sizing
const maxPopulation = Math.floor(availableMemory / memoryPerAgent);
gaConfig.populationSize = clamp(maxPopulation, 10, 500);
```

## Error Handling

All errors from `cash-lib` are caught and properly formatted:

```typescript
import { AgentError } from 'cash-lib/utils/Errors';

try {
  agent.step(features, price);
} catch (error) {
  if (error instanceof AgentError) {
    console.error(`Agent Error: ${error.message}`);
  }
  throw error; // Bubble up to global error handler
}
```

## Monitoring & Logging

Key metrics to monitor:

```typescript
// Training progress
console.log(`
  Generation: ${generation}
  Population: ${population.size}
  Best Fitness: ${bestFitness}
  Avg Fitness: ${avgFitness}
  Diversity: ${diversity}
  Memory Used: ${memoryUsed}%
`);

// Agent performance
console.log(`
  Agent ID: ${agent.id}
  Sharpe: ${metrics.sharpeRatio}
  Win Rate: ${metrics.winRate}
  Max Drawdown: ${metrics.maxDrawdown}
  Trades Executed: ${metrics.totalTrades}
`);
```

## Code Standards & Guidelines

See [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) for:

- Naming conventions
- JSDoc documentation format
- Error handling patterns
- Unit testing requirements
- Performance guidelines

## Debugging

Enable debug logging:

```bash
DEBUG=trader-trainer:* npm run dev
```

Sample genomes and test data:

```bash
npm run generate:test-data
npm run inspect:best-agent
```

## Contributing

1. Write unit tests for any new features
2. Follow naming conventions from CODE_OF_CONDUCT.md
3. Add JSDoc comments to all public functions
4. Run `npm test` and `npm run lint` before committing
5. Update ARCHITECTURE.md if adding new modules

## Roadmap

- [ ] Distributed training (multi-machine evolution)
- [ ] Transfer learning from pre-trained models
- [ ] Multi-pair agent evolution (one agent trades multiple pairs)
- [ ] Ensemble methods (voting committee of agents)
- [ ] Real-time weight updates (online learning)
- [ ] Advanced selection operators (NSGA-III)
- [ ] Web dashboard for monitoring training

## License

ISC

## Support

For issues, questions, or contributions, please contact the development team or open an issue in the repository.

---

**Version**: 1.0.0  
**Last Updated**: May 2026  
**Maintainer**: Docteur Turboss
