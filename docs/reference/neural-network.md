# Neural Network Module — Implementation Reference

> **New to NN concepts?** See [Neural Network — Concepts](../concepts/neural-network.md) for explanations of feedforward architecture, activation functions, DQN, and experience replay before reading this implementation reference.

## Overview

This document describes the neural network module (`src/domain/neural-network/`) implementation. It covers the class API, TypeScript types, configuration, and training modes.

---

## Architecture

### Module Files

| File                       | Responsibility                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `neural-network.ts`        | Core network class: forward/backward pass, training, pooling                                  |
| `network-serialization.ts` | Weight serialization: `getWeights`, `setWeights`, `parameterCount`, `distributeAroundWeights` |
| `activation.ts`            | Activation functions                                                                          |
| `initializers.ts`          | Weight/bias initializers                                                                      |
| `output-delta-computer.ts` | Mean squared error loss and output deltas                                                     |
| `gradient-applier.ts`      | Weight gradients and the SGD step                                                             |
| `normalizers.ts`           | Input normalization strategies                                                                |
| `type.ts`                  | Shared types                                                                                  |
| `utils.ts`                 | Utilities                                                                                     |

### `NeuralNetwork` (`neural-network.ts`)

The core network class. Structure: `Input → Hidden Layer × N → Output`.

#### Configuration

```typescript
interface NeuralNetworkConfig {
  neuronsByLayer: number[]; // [input, hidden1, ..., output]
  activationType: ActivationType[]; // one per hidden+output layer
  learningRate: number; // default 0.001
  initialisationType: string; // 'random' | 'he' | 'xavier' | 'lecun' | 'zeros'
  normalisationType: string; // 'none' | 'minmax' | 'zscore' | ...
  connectionType: string; // 'fully-connected' | 'dense-skip' | 'residual-connection'
  enablePool: boolean; // experience replay pool
  poolMaxSize: number; // max pool size (default 10,000)
  gradientClipNorm: number; // gradient clipping threshold
}
```

#### Forward Pass (`forward`)

Stateless computation returning a `ForwardContext` containing all intermediate values:

1. **Normalize** input vector
2. For each layer:
   - Compute pre-activations: `z = W @ input + b`
   - Apply activation: `output = activation(z)`
   - Apply connection strategy (skip/residual if configured)
3. Return output + layerZValues + layerOutputs

#### Backward Pass (`backprop`)

Standard backpropagation via chain rule:

1. Compute output layer deltas from loss gradient × activation derivative
2. Propagate deltas backward through hidden layers
3. Compute weight gradients (outer product of delta × layer input)
4. Apply gradients via optimizer

#### Training

`train(input, target)`: single-sample forward + backprop, returns the loss before the step.

#### Weight Serialization

- `getWeights()` → Flat `Float32Array` of all weights + biases
- `setWeights(buffer)` → Load from flat array
- `distributeAroundWeights(reference, sigma)` → Initialize around given mean with Gaussian noise

---

### `Agent` (`agent.ts`)

Pairs a `NeuralNetwork` (`agent.nn`) with its experience replay pool (`agent.experience`):

- `experience.remember(transition)`: stores a `{input, output, reward, nextState, done, action}` transition
- `experience.replay(nn, batchSize, discount)`: samples `batchSize` transitions (by TD error when prioritized, uniformly otherwise) and trains on each, moving the played action towards:

```
target[a] = r + γ · max_a' Q(s', a')   (non-terminal)
target[a] = r                            (terminal)
```

---

### `TradingAgent` (`agent/trading-agent.ts`)

Orchestrates NeuralNetwork + Wallet + StateManager for the training loop:

```
step(features, price):
  1. wallet.setPrice(price)
  2. reward = PnL now - PnL just before the previous decision's trade
     # the previous decision's reward: its trading cost + the price move it was exposed to
  3. state = [features..., exposure]       # market features + agent state (agent-state.ts)
     output = nn.forward(state)
  4. action = epsilon-greedy over output     # 0=sell, 1=hold, 2=buy
  5. wallet.buy/sell(amount)
  6. state.decayEpsilon()
  7. return { state, action, actionIndex, reward, metrics }

remember(transition)          # replay buffer
replay(batchSize, discount)   # minibatch Q-learning update (PER weights when prioritized)
```

**Action mapping**: one Q-value per action, `0=sell, 1=hold, 2=buy`; a random action with probability epsilon, the argmax otherwise.

---

### Activation Functions (`activation.ts`)

| Function      | Range         | Use case                |
| ------------- | ------------- | ----------------------- |
| **ReLU**      | [0, ∞)        | Hidden layers (default) |
| **Sigmoid**   | (0, 1)        | Binary output           |
| **Tanh**      | (-1, 1)       | Zero-centered hidden    |
| **GELU**      | ≈(-0.5, ∞)    | Transformer-style       |
| **ELU**       | (-α, ∞)       | Smooth ReLU alternative |
| **Mish**      | ≈(-0.3, ∞)    | Self-regularized        |
| **LeakyReLU** | (-∞, ∞)       | Avoids dead neurons     |

---

### Optimizer (`gradient-applier.ts`)

Plain SGD: `θ = θ - lr · ∇θ`, on the weights and, when `useBias`, on the biases.

---

### Loss (`output-delta-computer.ts`)

Mean squared error: `mean((t - o)²)`, gradient `2 (o - t) / n`. Output and target lengths must match (`RangeError` otherwise).

---

### Weight Initializers (`initializers.ts`)

| Initializer | Distribution       | When to use              |
| ----------- | ------------------ | ------------------------ |
| **Zeros**   | 0                  | Biases only              |
| **Random**  | `U(-0.5, 0.5)`     | Simple networks          |
| **He**      | `N(0, √(2/fanIn))` | ReLU activations         |
| **Xavier**  | `N(0, √(1/fanIn))` | Tanh/Sigmoid activations |
| **LeCun**   | `N(0, √(1/fanIn))` | LeCun-style              |

---

### Normalization Strategies (`normalize.ts`)

| Strategy | Method |
| ------------------- | ----------------------------------- | --- | --- |
| **none** | Pass-through |
| **min-max** | `(x - min) / (max - min)` |
| **z-score** | `(x - mean) / std` |
| **robust** | `(x - median) / IQR` |
| **max** | `x / max(                           | x   | )` |
| **log** | `log(1 + x)` |
| **decimal-scaling** | `x / 10^k` |
| **border** | `(x - a) / (b - a)` in [a,b], 0 o/w |
| **batch** | Batch normalization placeholder |
| **layer** | Layer normalization placeholder |
| **instance** | Instance normalization placeholder |

---

## Types (`type.ts`)

Key types used across the module:

```typescript
interface Experience {
  input: Float32Array;
  output: Float32Array;
  reward?: number;
  nextState?: Float32Array;
  done?: boolean;
  target?: Float32Array; // supervised learning
}

interface ForwardContext {
  input: Float32Array;
  output: Float32Array;
  layerZValues: Float32Array[];
  layerOutputs: Float32Array[];
}

interface LayerMemory {
  fanIn: number;
  fanOut: number;
  weights: Float32Array;
  bias: Float32Array;
  output: Float32Array;
  z: Float32Array;
  delta: Float32Array;
  gradW: Float32Array;
  gradB: Float32Array;
  wState: Record<string, Float32Array | number>;
  bState: Record<string, Float32Array | number>;
}
```
